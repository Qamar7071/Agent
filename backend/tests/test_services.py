"""Live-data services, with fake HTTP: honest availability, sources, timestamps and limits."""
from datetime import date, timedelta

import pytest

import config
from conftest import FakeResponse, open_meteo_handler, pmd_handlers
from services import conditions, http, roads, routing, weather


@pytest.fixture
def live(monkeypatch):
    for name in ("WEATHER_ENABLED", "PMD_ALERTS_ENABLED", "ROUTING_ENABLED"):
        monkeypatch.setattr(config, name, True)


def test_forecast_has_source_time_confidence_and_risks(live, web):
    web.on(weather.OPEN_METEO, open_meteo_handler(rain=25.0, code=95, elevation=3300))
    start = date.today() + timedelta(days=5)
    fc = weather.forecast("hunza", start.isoformat(), 6)
    assert fc["available"] and fc["source"] == "Open-Meteo forecast model" and fc["retrieved_at"]
    assert fc["current"]["kind"].startswith("Current conditions from the forecast model")
    assert fc["days"][0]["confidence"] == "higher" and fc["days"][-1]["confidence"].startswith("lower")
    assert any("Thunderstorms" in r for r in fc["days"][0]["risks"])
    assert any("landslide" in r for r in fc["days"][0]["risks"])
    assert "model grid cell" in fc["note"]          # 3300 m grid vs 2500 m destination


def test_forecast_refuses_past_and_far_future_dates(live, web):
    past = weather.forecast("hunza", (date.today() - timedelta(days=10)).isoformat(), 3)
    assert past["available"] is False and "past" in past["reason"]
    far = weather.forecast("skardu", (date.today() + timedelta(days=60)).isoformat(), 5)
    assert far["available"] is False and "16 days" in far["reason"] and far["seasonal_note"]
    assert web.calls == []                          # never asked the service for impossible data


def test_forecast_failure_is_reported_not_invented(live, web):
    web.on(weather.OPEN_METEO, FakeResponse(status=503))
    fc = weather.forecast("skardu")
    assert fc["available"] is False and "could not be reached" in fc["reason"]
    assert "days" not in fc


def test_weather_switched_off_says_so():
    fc = weather.forecast("hunza")
    assert fc["available"] is False and "switched off" in fc["reason"]


def test_pmd_alerts_parse_cap_and_pick_the_gilgit_baltistan_line(live, web):
    pmd_handlers(web)
    alerts = weather.pmd_alerts()
    assert alerts["available"] and alerts["official"] and alerts["feed_updated"].startswith("2026-10-09")
    assert len(alerts["alerts"]) == 1                    # the Sindh-only alert is not about our region
    a = alerts["alerts"][0]
    assert a["active"] is True and a["severity"] == "Moderate"
    assert a["region_excerpt"].startswith("Kashmir/Gilgit-Baltistan")
    assert "road status" in alerts["note"]


def test_expired_alert_is_not_active(live, web):
    pmd_handlers(web, expires="2026-10-14T00:00:00+05:00")
    assert weather.pmd_alerts()["active_count"] == 0


def test_road_status_is_never_reported_as_open(live, web):
    web.on("https://cap-sources", FakeResponse(status=500))
    status = roads.road_status(["hunza", "khunjerab"], f"{date.today().year + 1}-01-15")
    assert status["status"] == "not_verified"
    assert status["headline"] == "Current road status could not be verified."
    assert status["rule"] == "No closure report found does not mean the road is open."
    assert status["official_weather_alerts"]["available"] is False
    khunjerab = next(s for s in status["seasonal_outlook"] if s["route"].startswith("Khunjerab"))
    assert khunjerab["usually_open_that_month"] is False and "not live" in khunjerab["kind"]
    assert any(c["phone"] == "130" for c in status["official_checks"] if c.get("phone"))
    assert status["news"]["available"] is False and status["model_estimate"]["available"] is False


def test_news_is_labelled_unverified(monkeypatch, web):
    monkeypatch.setattr(config, "TAVILY_API_KEY", "test")
    web.on("https://api.tavily.com", FakeResponse({"results": [
        {"title": "KKH blocked near Dasu after landslide", "url": "https://news.example/1", "content": "...",
         "published_date": "2026-10-26"},
        {"title": "Tourists enjoy autumn in Hunza", "url": "https://news.example/2", "content": "..."}]}))
    status = roads.road_status(["hunza"])
    assert status["news"]["status"] == "unverified reports"
    assert [r["title"] for r in status["unverified_closure_reports"]] == ["KKH blocked near Dasu after landslide"]
    assert status["status"] == "not_verified"


def test_synthetic_kkh_model_is_marked_experimental(monkeypatch, web):
    monkeypatch.setattr(config, "KKH_RISK_API_URL", "https://kkh.test")
    web.on("https://kkh.test/api/predict", FakeResponse({
        "data_mode": "synthetic", "target_date": "2026-10-28", "generated_at": "2026-10-27T10:00:00Z",
        "summary": {"p_full_route_open": 0.82},
        "segments": [{"name": "Besham–Dasu", "band": {"label": "Medium"}, "probability": 0.2}]}))
    model = roads.road_status(["hunza"])["model_estimate"]
    assert model["experimental"] is True and "synthetic" in model["caveat"]
    assert "not observed status" in model["kind"]


def test_osrm_route_is_labelled_as_free_flow(live, web):
    web.on(config.OSRM_URL, FakeResponse({"routes": [{"distance": 612000, "duration": 36000}]}))
    r = routing.osrm("islamabad", "hunza")
    assert r["available"] and r["km"] == 612 and r["free_flow_hours"] == 10.0
    assert "closures are not included" in r["note"]


def test_conditions_map_forecasts_onto_plan_days(live, web):
    web.on(weather.OPEN_METEO, open_meteo_handler(snow=8.0, code=73))
    pmd_handlers(web)
    start = date.today() + timedelta(days=2)
    days = [{"day": 1, "date": start.isoformat(), "destination_id": "hunza"},
            {"day": 2, "date": (start + timedelta(days=1)).isoformat(), "destination_id": "hunza"}]
    c = conditions.trip_conditions(["hunza"], start.isoformat(), 2, days)
    assert c["forecasts"]["hunza"]["available"]
    assert [d["day"] for d in c["day_weather"]] == [1, 2]
    assert c["day_weather"][0]["alternative"]          # snow risk -> bad-weather alternative attached
    assert c["weather_flags"] and c["roads"]["status"] == "not_verified"


def test_failures_are_cached_only_briefly():
    calls = []

    def fetch():
        calls.append(1)
        return {"available": False}

    http.cached("k", 3600, fetch)
    http.cached("k", 3600, fetch)
    assert len(calls) == 1                               # cached…
    http._cache["k"] = (0, http._cache["k"][1])          # …but at most 60 s, simulate expiry
    http.cached("k", 3600, fetch)
    assert len(calls) == 2
