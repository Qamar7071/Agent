"""Multi-agent system: orchestration, each specialist, validation and retries, Travel Twin, Guardian.

Live services are off or faked, so these tests check the agents' own logic and the honesty of
what they return, not the live data itself.
"""
import json

import pytest

import config
from agents import orchestrator
from agents.eco_agent import footprint
from agents.packing_agent import checklist
from agents.safety_agent import assess
from conftest import FakeResponse, open_meteo_handler, say
from guardian import changes
from planner import build
from schemas import TripRequest
from services import weather
from twin import scenarios
from twin.simulation import simulate

DEMO = "Plan a 5-day Hunza trip from Gilgit for 4 people with a PKR 150,000 budget, including Khunjerab Pass"


def demo_request(**kw) -> dict:
    return TripRequest(origin="Gilgit", destinations=["hunza", "khunjerab"], days=5, adults=4, budget_pkr=150000,
                       **kw).model_dump(mode="json")


def tasks_by_agent(run):
    out = {}
    for t in run["tasks"]:
        out.setdefault(t["agent"], []).append(t)
    return out


# ── Orchestration ──────────────────────────────────────────────────────────────────
def test_orchestrator_runs_the_plan_pipeline_and_waits_for_a_budget_decision():
    r = orchestrator.orchestrate(DEMO)
    by = tasks_by_agent(r["run"])
    for name in ("memory", "research", "itinerary", "weather", "route", "budget", "accommodation", "eco", "safety",
                 "packing", "validation"):
        assert by[name][-1]["status"] in ("completed", "waiting_for_approval"), name
    assert by["orchestrator"][0]["status"] == "waiting_for_approval"
    assert r["validation"]["verdict"] == "needs_approval"
    assert r["validation"]["decisions"][0]["code"] == "over_budget"
    assert r["twin"]["request"]["origin"] == "Gilgit" and r["twin"]["summary"]["days"] == 5
    assert "could not be verified" in r["answer"] and r["answer_mode"] == "rules"
    itin = by["itinerary"][0]["id"]
    assert all(itin in by[n][0]["depends_on"] for n in ("weather", "route", "budget", "eco"))
    assert {"weather", "itinerary"} <= {r["run"]["tasks"][[t["id"] for t in r["run"]["tasks"]].index(d)]["agent"]
                                        for d in by["safety"][0]["depends_on"]}


def test_every_task_has_real_ordered_events():
    r = orchestrator.orchestrate(DEMO)
    for t in r["run"]["tasks"]:
        kinds = [e["type"] for e in r["run"]["events"] if e["task"] == t["id"] and e["type"] != "tool"]
        assert kinds[0] == "queued" and "running" in kinds
        assert kinds[-1] in ("completed", "waiting_for_approval", "failed")
        assert t["duration_ms"] is not None and t["started_at"] <= t["ended_at"]


def test_only_the_agents_a_request_needs_are_activated():
    r = orchestrator.orchestrate("What should I pack for 6 days in Skardu in January?")
    agents = {t["agent"] for t in r["run"]["tasks"]}
    assert r["intent"] == "packing"
    assert {"itinerary", "weather", "packing", "validation"} <= agents
    assert not agents & {"budget", "eco", "accommodation", "route"}


def test_without_a_destination_it_researches_and_asks():
    r = orchestrator.orchestrate("I want a peaceful lake trip in May")
    assert r["plan"] is None and r["twin"] is None
    assert {t["agent"] for t in r["run"]["tasks"]} == {"orchestrator", "memory", "research"}
    assert "Where would you like to go?" in r["answer"]
    assert r["agents"]["research"]["suggestions"]


def test_a_failing_agent_is_reported_and_the_rest_still_answer(monkeypatch):
    from agents.eco_agent import EcoAgent

    def boom(self, bb, tracer, tid):
        raise RuntimeError("factor table missing")
    monkeypatch.setattr(EcoAgent, "run", boom)
    r = orchestrator.orchestrate(DEMO)
    eco = tasks_by_agent(r["run"])["eco"][0]
    assert eco["status"] == "failed" and "factor table missing" in eco["errors"][0]
    assert "eco" not in r["agents"] and r["plan"] and "Transport emissions" not in r["answer"]


def test_validation_asks_the_weather_agent_to_retry_once(monkeypatch, web):
    monkeypatch.setattr(config, "WEATHER_ENABLED", True)
    calls = {"n": 0}
    ok = open_meteo_handler()

    def flaky(url, params=None, **kw):
        calls["n"] += 1
        return FakeResponse(status=503) if calls["n"] <= 2 else ok(url, params=params, **kw)
    web.on(weather.OPEN_METEO, flaky)
    from datetime import date, timedelta
    start = (date.today() + timedelta(days=3)).isoformat()
    r = orchestrator.orchestrate(f"Plan 5 days in Hunza from Gilgit starting {start} for 2 people")
    weather_tasks = tasks_by_agent(r["run"])["weather"]
    assert len(weather_tasks) == 2
    first_validation = tasks_by_agent(r["run"])["validation"][0]["id"]
    assert weather_tasks[1]["initiated_by"] == first_validation
    assert r["agents"]["weather"]["available"] is True and r["agents"]["weather"]["day_weather"]
    assert any(e["kind"] == "request" for e in r["run"]["edges"])


def test_ai_wording_is_kept_only_when_figures_survive_and_no_claim_is_added(ai):
    base = orchestrator.orchestrate(DEMO)["answer"]
    figures = __import__("re").findall(r"\d[\d,]{3,}", base)
    ai.script([say("A lovely trip! " + " ".join(figures))])
    assert orchestrator.orchestrate(DEMO)["answer_mode"] == "ai"
    ai.script([say("Great news, the road is open. " + " ".join(figures))])
    r = orchestrator.orchestrate(DEMO)
    assert r["answer_mode"] == "rules" and "road is open" not in r["answer"]
    ai.script([say("A lovely trip for about PKR 99,999.")])
    assert orchestrator.orchestrate(DEMO)["answer_mode"] == "rules"


def test_a_retry_asks_the_service_again_instead_of_reusing_a_cached_failure():
    from services import http
    calls = []

    def fetch():
        calls.append(1)
        return {"available": len(calls) > 1}
    assert http.cached("t:retry", 60, fetch)["available"] is False
    assert http.cached("t:retry", 60, fetch)["available"] is False and len(calls) == 1      # failure cached briefly
    assert http.cached("t:retry", 60, fetch, refresh_failed=True)["available"] is True
    assert http.cached("t:retry", 60, fetch, refresh_failed=True)["available"] is True and len(calls) == 2


@pytest.mark.parametrize("text,intent", [
    ("What should I pack for 6 days in Skardu in January?", "packing"),
    ("Is my Hunza trip safe?", "safety"),
    ("5 day trip to Hunza with 150000 budget", "plan"),
    ("Cheaper hotels in Hunza", "stays"),
    ("carbon footprint of my trip", "eco"),
])
def test_intent_detection(text, intent):
    assert orchestrator.detect_intent(text) == intent


def test_validation_rejects_unsupported_claims():
    from agents.validation_agent import check
    plan = build(TripRequest(origin="Gilgit", destinations=["hunza"], days=4))
    out = check({"itinerary": {"plan": plan}}, {"route": "The road is open all the way."}, None)
    assert out["verdict"] == "fail"
    assert any(c["name"] == "no_unsupported_claims" and not c["ok"] for c in out["checks"])


# ── Specialists ───────────────────────────────────────────────────────────────────
def test_safety_score_is_explained_and_uses_places_actually_reached():
    plan = build(TripRequest.model_validate(demo_request(travel_month=1)))
    risk = assess(plan, None)
    by_day = {d["day"]: d for d in risk["days"]}
    assert "high_altitude" not in [f["factor"] for f in by_day[3]["factors"]]       # travel day to Sost
    day4 = [f["factor"] for f in by_day[4]["factors"]]
    assert "seasonal_closure" in day4 and "high_altitude" in day4                    # Khunjerab, January
    for d in risk["days"]:
        assert d["score"] == min(100, round(sum(f["points"] for f in d["factors"])))
        assert all(f["evidence"] and f["source"] for f in d["factors"])
    assert risk["confidence"] == "low" and "not an official" in risk["disclaimer"]
    assert risk["weights"]["forecast_severe"] == 30


def test_safety_confidence_gives_the_real_reason_a_forecast_is_missing():
    from datetime import date, timedelta
    plan = build(TripRequest(origin="Gilgit", destinations=["hunza"], days=3,
                             start_date=date.today() + timedelta(days=4)))
    risk = assess(plan, {"available": False, "reason": "The weather service could not be reached right now.",
                         "day_weather": []})
    assert risk["confidence"] == "low" and "could not be reached" in risk["confidence_reason"]


def test_eco_estimates_are_ranges_and_coaches_are_lowest():
    car = footprint(build(TripRequest.model_validate(demo_request())))
    bus = footprint(build(TripRequest.model_validate(demo_request(transport="bus"))))
    assert car["kg_co2e"][0] < car["kg_co2e"][1] and bus["kg_co2e"][1] < car["kg_co2e"][1]
    assert car["vehicles"] == 1 and "Large diesel car" in car["parts"][0]["basis"]


def test_packing_follows_season_activities_and_scenarios():
    plan = build(TripRequest(origin="Islamabad", destinations=["fairy-meadows"], days=6, travel_month=7))
    base = checklist(plan, None)
    names = [i["name"] for i in base["items"]]
    assert base["basis"].startswith("typical") and any("trekking boots" in n for n in names)
    snowy = checklist(plan, None, {"type": "heavy_snow"})
    assert any("Waterproof boots" in i["name"] for i in snowy["items"]) and "snowfall scenario" in snowy["basis"]
    assert all(i["why"] for i in base["items"])


# ── Travel Twin ────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,kind", [
    ("What if the Khunjerab route becomes unavailable on Day 4?", "road_closed"),
    ("What if heavy snow falls from day 2?", "heavy_snow"),
    ("What if my budget decreases by 20%?", "budget_change"),
    ("What if I remove one day?", "days_change"),
    ("What if Attabad Lake is inaccessible?", "destination_closed"),
    ("What if I extend the trip by 2 days?", "days_change"),
    ("What if 2 more people join?", "group_change"),
    ("What if we want more adventure activities?", "more_adventure"),
    ("agar KKH Gilgit Hunza road band ho jaye din 2 ko", "road_closed"),
])
def test_scenario_parser(text, kind):
    assert scenarios.parse(text)["type"] == kind


def test_unknown_scenarios_are_refused():
    with pytest.raises(scenarios.ScenarioError):
        scenarios.parse("what if the moon falls")


def test_khunjerab_closure_on_day_4_keeps_the_original_and_compares():
    req = demo_request()
    sim = simulate(req, text="What if the Khunjerab route becomes unavailable on Day 4?")
    assert sim["ok"] and sim["scenario"]["from_day"] == 4
    assert req == demo_request()                                     # the original request is untouched
    assert "khunjerab" in sim["original"]["destinations"] and "khunjerab" not in sim["simulated"]["destinations"]
    cmp = sim["comparison"]
    assert cmp["days"][0]["status"] == "same" and cmp["days"][3]["status"] == "changed"
    assert "Khunjerab Pass road (Sost–border)" in cmp["route"]["removed"]
    assert cmp["time"]["delta"][1] < 0 and sim["recommendation"]["action"] == "accept"
    assert sim["run"]["tasks"][0]["status"] == "waiting_for_approval"
    statuses = {t["label"]: t["status"] for t in sim["run"]["tasks"]}
    assert statuses["Itinerary Planner (original)"] == "completed" and statuses["Itinerary Planner (scenario)"] == "completed"
    assert statuses["Validation (scenario)"] in ("completed", "waiting_for_approval")
    assert statuses["Comparison Engine"] == "completed"


def test_closure_that_the_plan_does_not_need_changes_nothing():
    sim = simulate(demo_request(), text="What if the Babusar road is closed?")
    assert sim["comparison"]["no_change"] and sim["recommendation"]["action"] == "keep"
    assert any(t["status"] == "skipped" for t in sim["run"]["tasks"])


def test_cutting_the_only_road_gives_no_fake_alternative():
    sim = simulate(demo_request(), text="What if the KKH between Gilgit and Hunza is blocked on day 1?")
    assert sim["ok"] and sim["no_alternative"] and "postpone" in sim["message"]


def test_budget_cut_finds_the_cheapest_changes():
    sim = simulate(demo_request(), text="What if my budget decreases by 20%?")
    assert sim["simulated"]["total_pkr"] < sim["original"]["total_pkr"]
    assert any("To fit the new budget" in c for c in sim["changes"])
    assert sim["confidence"] == "high"


def test_snowfall_adds_a_spare_day_and_raises_risk_as_an_assumption():
    sim = simulate(demo_request(), text="What if heavy snow falls from day 2?")
    assert sim["comparison"]["length"]["delta"] == 1
    assert sim["confidence"] == "low" and any("not a forecast" in a for a in sim["assumptions"])
    assert sim["comparison"]["risk"]["delta"] > 0
    factors = [f for d in sim["agents"]["safety"]["days"] for f in d["factors"] if f["factor"] == "scenario_hazard"]
    assert factors and all(f["kind"] == "scenario" for f in factors)


# ── Guardian and API ───────────────────────────────────────────────────────────────
def test_guardian_reports_changes_since_the_last_check():
    current = {"overall": {"category": "High", "score": 45}, "days": [{"day": 2, "title": "X", "score": 45, "category": "High"}],
               "alert_titles": ["Heavy snow warning"]}
    previous = {"overall": {"category": "Low", "score": 10}, "days": [{"day": 2, "score": 10, "category": "Low"}],
                "alert_titles": []}
    out = changes(previous, current)
    assert {c["kind"] for c in out} == {"overall", "day", "alert"} and all(c["severity"] == "high" for c in out)
    assert changes(None, current) == []


def test_agent_api_streams_events_then_the_result(client):
    r = client.post("/api/agents/run?stream=1", json={"message": DEMO})
    lines = [json.loads(x) for x in r.get_data(as_text=True).splitlines() if x]
    assert r.mimetype == "application/x-ndjson" and lines[0]["type"] == "event" and lines[-1]["type"] == "result"
    assert lines[-1]["data"]["twin"]
    assert client.post("/api/agents/run", json={}).status_code == 400
    roster = client.get("/api/agents").get_json()
    assert {a["name"] for a in roster["agents"]} >= {"orchestrator", "safety", "validation", "twin"}


def test_twin_and_guardian_api_validate_input(client):
    req = demo_request()
    assert client.post("/api/twin/simulate", json={"request": req}).status_code == 400
    assert client.post("/api/twin/simulate", json={"request": req, "text": "what if the moon falls"}).status_code == 400
    bad = client.post("/api/twin/simulate", json={"request": req, "scenario": {"type": "road_closed", "segment": "nope"}})
    assert bad.status_code == 400
    ok = client.post("/api/twin/simulate", json={"request": req, "scenario": {"type": "days_change", "delta": 1,
                                                                             "label": "One more day"}})
    assert ok.status_code == 200 and ok.get_json()["comparison"]["length"]["delta"] == 1
    g = client.post("/api/guardian/check", json={"request": req}).get_json()
    assert g["ok"] and g["decision"] in ("continue", "continue with precautions", "modify", "reconsider")
