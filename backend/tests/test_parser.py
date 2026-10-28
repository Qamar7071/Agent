"""Reading trip details from English and Roman Urdu messages."""
from datetime import date

from agent import parser
from schemas import TripRequest, TripState

TODAY = date(2026, 10, 27)


def x(text):
    return parser.extract(text, TODAY)


def test_brief_example_message():
    s = x("Plan a 5-day trip to Skardu for two people. My budget is PKR 100,000. I like mountains, lakes, "
          "photography, local food, and peaceful places.")
    assert s["destinations"] == ["skardu"] and s["days"] == 5 and s["adults"] == 2 and s["budget_pkr"] == 100000
    assert {"mountains", "lakes", "photography", "food"} <= set(s["interests"])


def test_roman_urdu_message():
    s = x("hunza jana hai 4 din ke liye, hum 3 log hain, budget 80 hazar")
    assert s == {"destinations": ["hunza"], "days": 4, "adults": 3, "budget_pkr": 80000}


def test_money_formats_and_basis():
    assert x("budget 1.5 lakh per person")["budget_pkr"] == 150000
    assert x("budget 1.5 lakh per person")["budget_basis"] == "per_person"
    assert x("Rs 80k total")["budget_pkr"] == 80000
    assert x("we can spend 120,000 rupees")["budget_pkr"] == 120000
    assert "budget_pkr" not in x("k2 base camp in 2027")
    assert "budget_pkr" not in x("leaving 2027-07-01")


def test_dates_and_months():
    assert x("from Lahore on 10 Nov")["start_date"] == date(2026, 11, 10)
    assert x("June 3rd")["start_date"] == date(2027, 6, 3)
    assert x("2027-07-01")["start_date"] == date(2027, 7, 1)
    assert x("in June for a week") == {"days": 7, "month": 6}
    assert x("next month")["month"] == 11


def test_people_days_and_relative_changes():
    assert x("5 nights")["days"] == 6
    assert x("2 adults and 1 kid")["adults"] == 2 and x("2 adults and 1 kid")["children"] == 1
    assert x("solo trip")["adults"] == 1
    assert x("one day less")["days_delta"] == -1 and x("ek din aur")["days_delta"] == 1


def test_removals_and_preferences():
    s = x("make it 5 days without Deosai and add Passu, by flight, luxury hotels, relaxed")
    assert s["remove_destinations"] == ["deosai"] and s["destinations"] == ["passu"]
    assert s["transport"] == "flight" and s["accommodation"] == "premium" and s["pace"] == "relaxed"
    assert x("my parents are elderly")["accessibility"] == ["elderly"]


def test_intents():
    assert "weather" in parser.intents("mausam kaisa hai?")
    assert "road" in parser.intents("is the KKH open?")
    assert "booking" in parser.intents("can you book it")
    assert parser.intents("hello") == {"greeting"}


def test_merge_updates_memory_and_assumptions():
    state = TripState(destinations=["hunza"], assumed=["2 adults", "7 days"]).absorb(
        TripRequest(destinations=["hunza"], days=7))
    state = state.model_copy(update={"assumed": ["2 adults", "7 days"]})
    merged = parser.merge(state, x("we are 4 and we want Deosai too, remove hunza"))
    assert merged.adults == 4 and merged.destinations == ["deosai"]
    assert merged.assumed == ["7 days"]
    assert merged.changes_since_plan()["destinations"] == (["hunza"], ["deosai"])
