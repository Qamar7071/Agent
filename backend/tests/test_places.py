"""Places to stay and eat: curated ranges, OpenStreetMap listings (faked), honesty and the API."""
import pytest

import config
from agent import parser
from conftest import FakeResponse, say, tool_call
from planner import build
from schemas import ChatRequest, TripRequest
from services import places

HUNZA = (36.3167, 74.6667)


def element(i, name, tags, lat=HUNZA[0] + 0.005, lng=HUNZA[1], kind="node"):
    el = {"type": kind, "id": i, "tags": {"name": name, **tags} if name else tags}
    if kind == "way":
        el["center"] = {"lat": lat, "lon": lng}
    else:
        el.update(lat=lat, lon=lng)
    return el


STAYS = {"elements": [
    element(1, "Cheap Inn Hostel", {"tourism": "hostel", "phone": "+92 300 0000000"}),
    element(2, "Rakaposhi Guest House", {"tourism": "guest_house", "website": "rakaposhi.example.com"}),
    element(3, "Grand Peak Hotel", {"tourism": "hotel", "stars": "4"}, kind="way"),
    element(4, "Plain Hotel", {"tourism": "hotel", "website": "javascript:alert(1)"}, lat=HUNZA[0] + 0.02),
    element(5, None, {"tourism": "hotel"}),                                   # no name: skipped
    element(6, "Rakaposhi Guest House", {"tourism": "guest_house"}),        # duplicate: skipped
]}
FOOD = {"elements": [
    element(10, "Café de Hunza", {"amenity": "cafe", "cuisine": "coffee_shop;cake"}),
    element(11, "Baltit Kitchen", {"amenity": "restaurant", "cuisine": "local"}),
]}


@pytest.fixture
def osm(monkeypatch, web):
    monkeypatch.setattr(config, "PLACES_ENABLED", True)

    def handler(url, data=None, **_):
        return FakeResponse(FOOD if "amenity" in data["data"] else STAYS)
    web.on(config.OVERPASS_URLS[0], handler)
    return web


def test_curated_stays_are_matched_to_the_range(osm):
    res = places.stays("hunza", 5000, 8000)
    fit = {o["name"]: o["in_range"] for o in res["curated"]["options"]}
    assert fit["Local guesthouses in Karimabad"] is True and fit["Hunza Darbar Hotel"] is True
    assert fit["Hunza Serena Inn"] is False and fit["Eagle's Nest Hotel (Duikar)"] is False
    assert res["curated"]["options"][0]["in_range"] is True                    # matches listed first
    assert res["levels_in_range"] == ["budget", "mid-range"]
    assert "not quotes" in res["note"] and "no prices" in res["note"]


def test_openstreetmap_places_are_grouped_by_type_never_priced(osm):
    res = places.stays("hunza", 5000, 8000)
    live = res["live"]
    assert live["available"] and live["source"].startswith("OpenStreetMap") and live["retrieved_at"]
    by_name = {p["name"]: p for p in live["places"]}
    assert set(by_name) == {"Cheap Inn Hostel", "Rakaposhi Guest House", "Grand Peak Hotel", "Plain Hotel"}
    assert by_name["Cheap Inn Hostel"]["fit"] == "usually"
    assert by_name["Rakaposhi Guest House"]["fit"] == "usually"
    assert by_name["Grand Peak Hotel"]["fit"] == "unlikely" and by_name["Grand Peak Hotel"]["stars"] == 4
    assert by_name["Plain Hotel"]["fit"] == "unknown"                         # a hotel's type says nothing
    assert by_name["Rakaposhi Guest House"]["website"] == "https://rakaposhi.example.com"
    assert by_name["Plain Hotel"]["website"] is None                          # unsafe link dropped
    assert by_name["Grand Peak Hotel"]["osm_url"] == "https://www.openstreetmap.org/way/3"
    assert all("price" not in key for p in live["places"] for key in p)
    assert [p["fit"] for p in live["places"]] == ["usually", "usually", "unknown", "unlikely"]


def test_overpass_failure_is_reported_and_the_mirror_is_tried(monkeypatch, web):
    monkeypatch.setattr(config, "PLACES_ENABLED", True)
    web.on(config.OVERPASS_URLS[0], FakeResponse(status=429))
    web.on(config.OVERPASS_URLS[1], FakeResponse(STAYS))
    assert places.stays("skardu")["live"]["count"] == 4
    web.routes.clear()
    for url in config.OVERPASS_URLS:
        web.on(url, FakeResponse(status=504))
    res = places.stays("gilgit")
    assert res["live"]["available"] is False and "could not be reached" in res["live"]["reason"]
    assert res["curated"] is None and res["check_prices"]                     # still useful links


def test_switched_off_and_operator_only_places():
    assert "switched off" in places.stays("hunza")["live"]["reason"]
    k2 = places.stays(places.resolve_town("K2"))
    assert k2["available"] is False and "operator" in k2["message"]
    assert places.resolve_town("Khunjerab") == "sost" and places.resolve_town("Lahore") is None


def test_food_has_dishes_and_restaurants(osm):
    res = places.food("hunza")
    assert res["dishes"]["area"] == "Hunza and Gojal" and any(d["name"] == "Chapshuro" for d in res["dishes"]["dishes"])
    cafe = next(p for p in res["live"]["places"] if p["type"] == "Café")
    assert cafe["cuisine"] == ["coffee shop", "cake"]
    assert places.food("skardu")["dishes"]["area"] == "Skardu and Baltistan"


def test_places_api_validates_input(client, osm):
    assert client.get("/api/places?town=lahore").status_code == 400
    assert client.get("/api/places?town=hunza&kind=shopping").status_code == 400
    assert client.get("/api/places?town=hunza&min=cheap").status_code == 400
    r = client.get("/api/places?town=Hunza&kind=stay&min=5000&max=8000")
    assert r.status_code == 200 and r.get_json()["range"] == {"min": 5000, "max": 8000}
    assert client.get("/api/places?town=skardu&kind=food").get_json()["dishes"]


def test_parser_reads_per_night_ranges_without_touching_the_trip_budget():
    s = parser.extract("Hunza mein 5000 se 8000 tak hotel batao")
    assert s["night_range"] == (5000, 8000) and s["place_towns"] == ["hunza"]
    assert "budget_pkr" not in s and "destinations" not in s
    assert parser.extract("hotels in skardu under 10k per night")["night_range"] == (None, 10000)
    assert parser.extract("cheap guest house in Passu")["night_range"] == (None, 7000)
    assert parser.extract("5-7 days in skardu").get("night_range") is None
    assert parser.extract("Plan 5 days in Hunza, budget 100000")["budget_pkr"] == 100000


def test_guided_hotel_question_lists_matches_and_keeps_the_trip(osm):
    from agent import runner
    state = parser.merge(__import__("schemas").TripState(), {"destinations": ["skardu"], "days": 6})
    r = runner.run_chat(ChatRequest.model_validate({
        "message": "Hunza mein 5000 se 8000 tak hotel batao", "history": [], "state": state.model_dump(mode="json")}))
    assert r["mode"] == "guided"
    assert "Places to stay in Karimabad (Hunza)** for Rs 5,000–8,000 a night" in r["reply"]
    assert "Hunza Darbar Hotel** (Mid-range): Rs 8,000–15,000, fits your range" in r["reply"]
    assert "Grand Peak Hotel" not in r["reply"]                              # premium type left out
    assert "Plain Hotel (Hotel): price level unknown" in r["reply"]
    assert r["state"]["destinations"] == ["skardu"]                          # trip unchanged
    assert r["places"][0]["town"] == "hunza"
    food = runner.run_chat(ChatRequest.model_validate({"message": "Hunza ka khana", "history": []}))
    assert "Chapshuro" in food["reply"] and "Café de Hunza" in food["reply"]


def test_ai_tool_gets_places_without_prices(ai, osm):
    llm = ai.script([tool_call("find_places", {"town": "Hunza", "kind": "stay", "max_pkr_per_night": 8000}),
                     say("Here are places that fit.")])
    r = runner_chat("hotels in hunza under 8000")
    import json
    result = json.loads(next(m["content"] for m in llm.requests[-1]["json"]["messages"] if m["role"] == "tool"))
    assert result["ok"] and result["openstreetmap"]["status"] == "real places from OpenStreetMap; no prices"
    assert any(o["in_range"] for o in result["curated_stays"])
    assert r["trace"][0]["tool"] == "find_places" and r["places"]


def runner_chat(message):
    from agent import runner
    return runner.run_chat(ChatRequest.model_validate({"message": message, "history": []}))


def test_budget_says_how_much_a_room_night_can_cost():
    plan = build(TripRequest(destinations=["hunza"], days=7, adults=2, budget_pkr=250000))
    allowance = plan["budget"]["stay_allowance"]
    assert allowance["rooms"] == 1 and allowance["nights"] == 6 and allowance["per_room_night"] % 500 == 0
    tight = build(TripRequest(destinations=["hunza"], days=7, adults=2, budget_pkr=40000))
    assert tight["budget"]["stay_allowance"]["per_room_night"] == 0
    assert build(TripRequest(destinations=["hunza"], days=7, adults=2))["budget"]["stay_allowance"] is None


def test_provider_errors_are_reported_without_keys():
    from agent.llm import _safe
    text = '{"error": {"message": "Incorrect API key provided: gsk_abcdef123456. Get one at console"}}'
    assert _safe(text) == "Incorrect API key provided: [key]. Get one at console"
    assert "AIza" not in _safe('[{"error": {"message": "API key AIzaSyXXXXXXXX not valid"}}]')


def test_money_is_written_the_pakistani_way():
    from money import lakh, rs, rs_range
    assert rs(150000) == "Rs 1,50,000" and rs(1500000) == "Rs 15,00,000" and rs(999) == "Rs 999"
    assert lakh(10000000) == "1,00,00,000" and rs(-36100) == "-Rs 36,100" and rs(1234.6) == "Rs 1,235"
    assert rs_range(7000, 18000) == "Rs 7,000–18,000" and rs_range(5000, 5000) == "Rs 5,000"
