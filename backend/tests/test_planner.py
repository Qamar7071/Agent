"""The deterministic planner: realistic days, honest feasibility, safe timing, preserved edits."""
from datetime import date, timedelta

import pytest

import planner
from schemas import EditDayOp, RegenerateDayOp, SetOp, AddDestinationOp, RemoveDestinationOp, TripRequest


def plan(**kw):
    return planner.build(TripRequest.model_validate(kw))


def future(days=40):
    return (date.today() + timedelta(days=days)).isoformat()


def test_road_trip_to_hunza_has_overnight_in_chilas_both_ways():
    p = plan(origin="Islamabad", destinations=["hunza"], days=7, start_date=future())
    keys = [d["key"] for d in p["days"]]
    assert keys[0] == "travel:islamabad>chilas" and keys[-1] == "travel:chilas>islamabad"
    assert len(p["days"]) == 7 and p["feasibility"]["ok"]
    assert p["days"][0]["overnight"]["name"] == "Chilas"
    assert p["days"][-1]["overnight"] is None
    assert [d["day"] for d in p["days"]] == list(range(1, 8))
    assert p["days"][1]["date"] == (date.fromisoformat(p["days"][0]["date"]) + timedelta(days=1)).isoformat()


def test_too_short_trip_is_flagged_not_silently_squeezed():
    p = plan(origin="Islamabad", destinations=["hunza", "skardu"], days=3)
    assert p["feasibility"]["ok"] is False
    assert len(p["days"]) == p["feasibility"]["planned_days"] > 3
    msg = next(w for w in p["warnings"] if w["code"] == "too_short")
    assert msg["level"] == "danger" and "fly" in msg["message"]


def test_flight_plan_keeps_a_buffer_day_before_flying_home():
    p = plan(origin="Islamabad", destinations=["hunza"], days=7, transport="flight", start_date=future())
    types = [d["type"] for d in p["days"]]
    assert types[0] == "travel" and p["days"][0]["moves"][0]["mode"] == "flight"
    assert p["days"][-1]["moves"][-1]["mode"] == "flight"
    assert types[-2] == "buffer"
    assert p["days"][-2]["overnight"]["hub"] == "gilgit"          # sleeps near the airport


def test_departure_is_timed_to_arrive_before_sunset_when_possible():
    p = plan(origin="Gilgit", destinations=["hunza", "passu"], days=5, start_date=future(20))
    for d in p["days"]:
        for m in d["moves"]:
            t = m["timing"]
            if t.get("sunset") and not t["after_dark_risk"] and t.get("arrive_around"):
                assert t["arrive_around"] <= t["sunset"]


def test_very_long_drive_is_flagged_as_after_dark_risk_in_winter():
    p = plan(origin="Islamabad", destinations=["skardu"], days=6, start_date=f"{date.today().year + 1}-01-10")
    first = p["days"][0]["moves"][0]["timing"]
    assert first["depart"] == "05:00" and first["after_dark_risk"] is True
    assert any("after dark" in r for r in p["days"][0]["risks"])


def test_seasonal_closure_is_a_danger_warning():
    p = plan(origin="Skardu", destinations=["skardu", "deosai"], days=4, start_date=f"{date.today().year + 1}-01-10")
    w = next(w for w in p["warnings"] if w["code"] == "season_deosai")
    assert w["level"] == "danger" and "Usually closed in January" in w["message"]
    assert any(w["code"] == "winter" for w in p["warnings"])


def test_month_only_requests_still_get_seasonal_checks():
    p = plan(origin="Islamabad", destinations=["khunjerab"], days=6, travel_month=12)
    assert any(w["code"] == "season_khunjerab" and w["level"] == "danger" for w in p["warnings"])
    assert all(d["date"] is None for d in p["days"])


def test_past_dates_are_rejected_with_a_warning():
    p = plan(destinations=["hunza"], days=6, start_date=(date.today() - timedelta(days=3)).isoformat())
    assert any(w["code"] == "past_dates" for w in p["warnings"])


def test_fairy_meadows_arrival_is_jeep_and_hike_and_k2_needs_fourteen_days():
    p = plan(origin="Islamabad", destinations=["fairy-meadows"], days=5, start_date=future())
    arrival = next(d for d in p["days"] if d["key"] == "fairy-meadows:0")
    assert arrival["moves"][0]["mode"] == "jeep"
    assert any("walk" in n for n in arrival["moves"][0]["notes"])
    k2 = plan(origin="Skardu", destinations=["k2"], days=10)
    assert k2["feasibility"]["ok"] is False and k2["feasibility"]["minimum_days"] >= 14
    assert any(w["code"] == "k2_operator" for w in k2["warnings"])


def test_accessibility_needs_produce_specific_warnings():
    p = plan(destinations=["fairy-meadows", "khunjerab"], days=9, accessibility=["wheelchair", "elderly"],
             start_date=future())
    codes = {w["code"]: w["level"] for w in p["warnings"]}
    assert codes["access_fairy-meadows"] == "danger"
    assert codes["altitude_khunjerab"] == "warning"
    assert "access_rooms" in codes


def test_karachi_by_road_starts_in_islamabad_and_says_so():
    p = plan(origin="Karachi", destinations=["hunza"], days=7)
    assert p["days"][0]["moves"][0]["from"] == "islamabad"
    assert any(w["code"] == "karachi_road" for w in p["warnings"])
    assert any("Karachi and Islamabad" in x for x in p["budget"]["not_included"])


def test_changes_keep_every_other_preference():
    req = TripRequest(origin="Lahore", destinations=["hunza"], days=8, adults=3, children=1, budget_pkr=300000,
                      budget_basis="total", transport="car", accommodation="premium", pace="relaxed",
                      interests=["photography"], food="vegetarian")
    new = planner.apply_changes(req, [SetOp(op="set", field="days", value=9),
                                      AddDestinationOp(op="add_destination", destination="Passu")])
    assert new.days == 9 and new.destinations == ["hunza", "passu"]
    for field in ("origin", "adults", "children", "budget_pkr", "transport", "accommodation", "pace", "interests",
                  "food"):
        assert getattr(new, field) == getattr(req, field)


def test_removing_the_last_destination_is_refused():
    with pytest.raises(planner.PlanError):
        planner.apply_changes(TripRequest(destinations=["hunza"]),
                              [RemoveDestinationOp(op="remove_destination", destination="hunza")])


def test_day_edits_survive_replanning_and_regenerate_changes_the_day():
    req = TripRequest(origin="Gilgit", destinations=["hunza"], days=4)
    req = planner.apply_changes(req, [EditDayOp(op="edit_day", key="hunza:1", title="Our own day",
                                                activities=["Visit a friend in Altit"])])
    p = planner.build(planner.apply_changes(req, [SetOp(op="set", field="pace", value="active")]))
    day = next(d for d in p["days"] if d["key"] == "hunza:1")
    assert day["edited"] and day["title"] == "Our own day" and day["activities"] == ["Visit a friend in Altit"]

    before = next(d for d in planner.build(TripRequest(origin="Gilgit", destinations=["hunza"], days=4))["days"]
                  if d["key"] == "hunza:0")["title"]
    regen = planner.apply_changes(TripRequest(origin="Gilgit", destinations=["hunza"], days=4),
                                  [RegenerateDayOp(op="regenerate_day", key="hunza:0")])
    after = next(d for d in planner.build(regen)["days"] if d["key"] == "hunza:0")["title"]
    assert before != after


def test_every_day_has_sources_risks_list_and_cost():
    p = plan(origin="Islamabad", destinations=["skardu", "deosai", "hunza"], days=10, start_date=future())
    for d in p["days"]:
        assert isinstance(d["risks"], list) and d["sources"]
        assert d["cost"]["total"] >= 0
    assert p["stays"] and all(s["nights"] >= 1 for s in p["stays"])
    assert p["honesty"] and "Nothing has been booked" in p["honesty"]


def test_sunset_calculation_is_plausible():
    june = planner.sunset_hour(35.92, 74.31, date(2026, 6, 21))     # Gilgit
    december = planner.sunset_hour(35.92, 74.31, date(2026, 12, 21))
    assert 19.0 < june < 19.7 and 16.8 < december < 17.4
