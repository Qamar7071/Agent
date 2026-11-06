"""The chat in Roman Urdu, budget changes on a plan, and 'is it safe this month?' questions.

The four messages in the product brief, word for word, plus the edge cases around them.
Guided mode (no AI key) unless a test turns the scripted model on.
"""
import json
from datetime import date

import pytest

from agent import lang, parser, runner
from agents.budget_agent import fit_to_budget
from clock import today_pk
from conftest import say
from schemas import ChatRequest, TripRequest, TripState

BRIEF = [
    "5 din Skardu jana hai, 4 log hain, budget 1 lakh hai.",
    "Hunza mein family ke saath best places suggest karo.",
    "Deosai jana safe rahega is month?",
    "Budget 20,000 kam kar do, itinerary change na ho zyada.",
]


def chat(message, state=None):
    return runner.run_chat(ChatRequest.model_validate({"message": message, "state": state}))


def skardu():
    return chat(BRIEF[0])


# ── Understanding ─────────────────────────────────────────────────────────────────
def test_the_brief_is_understood_word_for_word():
    today = date(2026, 11, 6)
    assert parser.extract(BRIEF[0], today) == {"destinations": ["skardu"], "days": 5, "adults": 4, "budget_pkr": 100000}
    hunza = parser.extract(BRIEF[1], today)
    assert hunza["destinations"] == ["hunza"] and hunza["interests"] == ["family"] and "suggest" in parser.intents(BRIEF[1])
    deosai = parser.extract(BRIEF[2], today)
    assert deosai == {"destinations": ["deosai"], "month": 11} and "safety" in parser.intents(BRIEF[2])
    cut = parser.extract(BRIEF[3], today)
    assert cut == {"budget_delta": -20000, "keep_itinerary": True}          # a change, never "budget = 20,000"
    assert all(lang.detect(m) == "ur" for m in BRIEF)


@pytest.mark.parametrize("text, expected", [
    ("budget mein 20k kam karo", {"budget_delta": -20000}),
    ("reduce the budget by 20000", {"budget_delta": -20000}),
    ("make it Rs 15,000 cheaper", {"budget_delta": -15000}),
    ("budget 10% kam kar do", {"budget_delta_pct": -10}),
    ("cut the cost by 15%", {"budget_delta_pct": -15}),
    ("increase the budget by 30k", {"budget_delta": 30000}),
    ("budget 20 hazar barha do", {"budget_delta": 20000}),
    ("budget 1 lakh hai", {"budget_pkr": 100000}),
    ("make it cheaper", {"accommodation": "budget"}),
    ("ek din kam kar do", {"days_delta": -1}),
])
def test_a_budget_change_is_not_a_new_budget(text, expected):
    assert parser.extract(text) == expected


def test_this_month_means_the_current_month():
    assert parser.extract("Is Deosai safe this month?", date(2026, 3, 2))["month"] == 3
    assert parser.extract("is mahine Hunza", date(2026, 7, 2))["month"] == 7


# ── Budget changes on a plan ──────────────────────────────────────────────────────
def test_lowering_the_budget_of_a_plan_keeps_the_days_and_the_stated_budget():
    first = skardu()
    assert first["lang"] == "ur" and first["itinerary"]["budget"]["total"] > 100000
    before = first["itinerary"]["budget"]["total"]
    r = chat(BRIEF[3], state=first["state"])
    fit = r["budget_fit"]
    req = r["itinerary"]["request"]
    assert fit["changed"] and fit["from"] == before and fit["target"] == before - 20000
    assert fit["to"] <= fit["target"] and r["itinerary"]["budget"]["total"] == fit["to"]
    assert req["days"] == 5 and req["destinations"] == ["skardu"] and req["adults"] == 4
    assert fit["change"] == {"accommodation": "budget"}          # stays before transport: the journey stays the same
    assert any(a["change"] == {"transport": "bus"} for a in fit["alternatives"])
    assert r["state"]["budget_pkr"] == 100000                  # what they said they can spend is not rewritten
    assert "Din aur jagahen wahi hain" in r["reply"] and "Doosra option: public coach" in r["reply"]
    assert "quote" in r["reply"] and r["lang"] == "ur"


def test_when_the_days_must_change_it_says_so_instead_of_doing_it():
    first = chat("Plan 9 days in Hunza from Islamabad for 2 people, mid-range stays, budget Rs 3,00,000")
    r = chat("reduce the budget by 60%", state=first["state"])
    fit = r["budget_fit"]
    assert not fit["fits"] and r["itinerary"]["request"]["days"] == 9
    assert "still about" in r["reply"] and "above the target" in r["reply"]
    if fit.get("if_days_change"):
        assert "one day less" in r["reply"]


def test_raising_the_budget_or_changing_it_before_a_plan():
    first = chat("Plan 6 days in Hunza from Islamabad for 2 people, budget Rs 1,50,000")
    up = chat("increase the budget by 50000", state=first["state"])
    assert up["state"]["budget_pkr"] == 200000 and up["itinerary"]["request"]["budget_pkr"] == 200000
    st = TripState(destinations=["hunza"], budget_pkr=150000).model_dump(mode="json")
    r = chat("budget 20,000 kam kar do", state=st)
    assert r["state"]["budget_pkr"] == 130000 and r["budget_fit"] is None


def test_the_optimiser_keeps_its_old_default():
    req = TripRequest(origin="Islamabad", destinations=["skardu"], days=5, adults=4)
    cheapest = fit_to_budget(req, 230000)
    closest = fit_to_budget(req, 230000, protect=("days",), prefer="closest")
    assert cheapest["best"]["total"] <= closest["best"]["total"]
    assert closest["best"]["change"].get("days") is None and "days" in closest["protected"]


# ── Safety and season ─────────────────────────────────────────────────────────────
def test_is_it_safe_this_month_answers_from_season_altitude_and_roads(monkeypatch):
    monkeypatch.setattr("agent.guided.today_pk", lambda: date(2026, 11, 6))
    monkeypatch.setattr("agent.parser.today_pk", lambda: date(2026, 11, 6))
    r = chat(BRIEF[2])
    reply = r["reply"]
    assert reply.startswith("**Deosai National Park November mein: aam taur par munasib nahi.**")
    assert "band hota hai" in reply and "Typical pattern, live nahi" in reply
    assert "4,114 m" in reply and "**Current road status could not be verified.**" in reply
    assert "sarkari safety assessment nahi" in reply
    # only places whose usual best months include November are called in season
    in_season = next(line for line in reply.splitlines() if "season hai" in line)
    assert "Hunza Valley" in in_season and "Skardu" not in in_season
    assert r["destinations"][0]["id"] == "deosai" and r["roads"]["status"] == "not_verified"


def test_the_same_question_in_english(monkeypatch):
    monkeypatch.setattr("agent.guided.today_pk", lambda: date(2026, 7, 10))
    monkeypatch.setattr("agent.parser.today_pk", lambda: date(2026, 7, 10))
    r = chat("Is Deosai safe this month?")
    assert r["lang"] == "en" and r["reply"].startswith("**Deosai National Park in July: usually a good time.**")
    assert "not an official safety assessment" in r["reply"] and "In season instead" not in r["reply"]


def test_best_places_with_family_then_asks_for_days():
    r = chat(BRIEF[1])
    reply = r["reply"]
    assert "Baltit Fort" in reply and "Eagle’s Nest" in reply and "Family ke saath" in reply
    assert "If it rains: If it rains" not in reply and "Kitne din hain" in reply
    assert r["itinerary"] is None and r["destinations"] == [{"id": "hunza", "why": []}]


# ── Language memory and the AI path ───────────────────────────────────────────────
def test_the_conversation_language_is_remembered_and_chips_follow_it():
    first = skardu()
    assert first["state"]["lang"] == "ur" and first["suggestions"][2] == "Budget 20,000 kam kar do"
    again = chat("ok", state=first["state"])
    assert again["state"]["lang"] == "ur"
    switch = chat("What is the weather like in Skardu?", state=first["state"])
    assert switch["lang"] == "en"


def test_the_ai_gets_the_optimiser_result_before_it_answers(ai):
    req = TripRequest(origin="Islamabad", destinations=["skardu"], days=5, adults=4, budget_pkr=100000)
    state = TripState(lang="ur").absorb(req).model_dump(mode="json")          # the plan already on screen
    llm = ai.script([say("Theek hai, budget hotel se kharcha kam ho gaya.")])
    r = chat(BRIEF[3], state=state)
    tool_msgs = [json.loads(m["content"]) for m in llm.requests[0]["json"]["messages"] if m["role"] == "tool"]
    assert tool_msgs and tool_msgs[0]["changed"] and tool_msgs[0]["kept_days"] is True
    assert r["mode"] == "ai" and r["budget_fit"]["change"] == {"accommodation": "budget"}
    assert any(t["tool"] == "fit_plan_to_budget" for t in r["trace"])
    assert runner.fit_args(parser.extract("budget 10% kam kar do")) == {"reduce_by_percent": 10, "keep_days": True}
    assert runner.fit_args(parser.extract("increase the budget by 30k")) is None
