"""'Where can we go?': every idea is a real plan, honestly labelled, ranked by fit."""
import planner
from explore import IDEAS, explore
from schemas import ExploreIn, TripRequest


def _ask(**kw):
    return explore(ExploreIn(**{"origin": "Islamabad", "days": 7, "adults": 2, **kw}))


def test_every_idea_is_the_planners_own_plan_for_the_group():
    res = _ask(budget_pkr=300000, month=7)
    assert res["ideas"] and res["considered"] >= 8
    for idea in res["ideas"]:
        req = TripRequest(**idea["request"])
        plan = planner.build(req, with_savings=False)
        assert plan["budget"]["total"] == idea["total"]           # the number shown is the plan's own estimate
        assert plan["title"] == idea["title"] and len(plan["days"]) == idea["days"]
        assert req.adults == 2 and req.origin == "Islamabad" and req.days == 7
    assert "not quotes" in res["note"] and "no road status" in res["note"]


def test_the_most_comfortable_way_that_fits_the_budget_is_chosen():
    roomy = _ask(budget_pkr=2_000_000, month=7)["ideas"]
    for i in roomy:
        if i["transport"] == "flight":         # only when the road can't fit the days
            by_road = TripRequest(**{**i["request"], "transport": "car"})
            assert not planner.build(by_road, with_savings=False)["feasibility"]["ok"]
            assert any("weather-dependent" in b for b in i["bad"])
        elif i["fits_days"]:
            assert (i["transport"], i["accommodation"]) == ("car", "mid")
    tight = _ask(budget_pkr=120_000, month=7)["ideas"]
    fitting = [i for i in tight if i["fits_budget"]]
    assert all(i["total"] <= 120_000 for i in fitting)
    assert any(i["transport"] == "bus" or i["accommodation"] == "budget" for i in tight)


def test_ideas_that_fit_rank_above_those_that_do_not():
    ideas = _ask(budget_pkr=250_000, month=8)["ideas"]
    ok = [n for n, i in enumerate(ideas) if i["fits_budget"] and i["fits_days"] and i["season"]["verdict"] == "best"]
    bad = [n for n, i in enumerate(ideas) if not i["fits_budget"] or not i["fits_days"]]
    assert ok and (not bad or max(ok) < min(bad))
    for i in ideas:
        if i["fits_budget"] and i["budget_status"] == "within":
            assert any("Fits your budget" in g and "estimate" in g for g in i["good"])


def test_winter_flags_closed_access_and_never_ranks_it_first():
    ideas = _ask(days=8, month=1)["ideas"]
    closed = [i for i in ideas if i["season"]["verdict"] == "closed"]
    assert closed, "Khunjerab, Deosai or Fairy Meadows should be flagged in January"
    assert ideas[0]["season"]["verdict"] != "closed"
    for i in closed:
        assert any("usually closed by snow" in b for b in i["bad"])


def test_too_few_days_says_how_many_are_needed_and_k2_needs_two_weeks():
    ideas = _ask(days=4)["ideas"]
    assert all("k2" not in i["destinations"] for i in ideas)
    short = [i for i in ideas if not i["fits_days"]]
    for i in short:
        assert any(f"Needs at least {i['minimum_days']} days" in b for b in i["bad"])
    long = _ask(days=18, month=7, style="adventure", limit=20)["ideas"]
    assert any(i["destinations"] == ["k2"] for i in long)


def test_easy_style_prefers_gentle_places_and_interests_count():
    easy = _ask(days=7, month=7, style="easy", interests=["lakes"])["ideas"]
    top = easy[0]
    assert not ({"fairy-meadows", "k2"} & set(top["destinations"]))
    assert any("Matches lakes" in g for g in top["good"]) or "lakes" not in str(top)


def test_validation_and_endpoint(client):
    r = client.post("/api/explore", json={"origin": "Islamabad", "days": 6, "adults": 3, "budget_pkr": 200000, "month": 6})
    assert r.status_code == 200
    body = r.get_json()
    assert body["ideas"] and {"title", "total", "per_person", "good", "bad", "request", "season"} <= set(body["ideas"][0])
    assert client.post("/api/explore", json={"origin": "Mars"}).status_code == 400
    assert client.post("/api/explore", json={"days": 1}).status_code == 400
    assert client.post("/api/explore", json={"surprise": True}).status_code == 400
    assert len(IDEAS) >= 10
