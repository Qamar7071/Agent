"""The shared destination dataset: complete, sourced, and honest about what is approximate."""
from datetime import date

import data
import planner


def test_every_destination_is_sourced_and_reviewed():
    meta = data.dataset()["meta"]
    date.fromisoformat(meta["last_reviewed"])
    for d in data.dataset()["destinations"]:
        assert d["sources"], d["id"]
        assert all(s["url"].startswith("https://") for s in d["sources"]), d["id"]
        date.fromisoformat(d["last_reviewed"])
        assert d["coords"]["verified"] is False and "approximate" in d["coords"]["precision"]
        assert d["bad_weather_alternative"] and d["accessibility"]
        assert 1 <= d["recommended_days"]["min"] <= d["recommended_days"]["default"] <= d["recommended_days"]["max"]
        assert set(d["best_months"]) <= set(range(1, 13))


def test_prices_and_legs_are_marked_unverified():
    for stay in data.dataset()["stays"].values():
        assert stay["price_note"]
        for option in stay["options"]:
            assert option["verified"] is False and "not a quote" in option["price_status"]
    for leg in data.dataset()["legs"]:
        assert leg["verified"] is False and leg["status"] == "approximate"
        for end in (leg["from"], leg["to"]):
            assert data.coords(end), f"no coordinates for {end}"
    assert "Not live" in data.cost_model()["status"]


def test_season_notes_never_claim_live_status():
    for note in data.dataset()["season_notes"].values():
        assert "Every road" not in note
    for route in data.seasonal_routes():
        assert set(route["typical_open_months"]) <= set(range(1, 13))


def test_destination_matching_uses_whole_words():
    assert data.match_destinations("High altitude worries") == []          # not "altit" (Hunza)
    assert data.match_destinations("A Gilgit-Baltistan trip") == []        # region, not Skardu
    assert data.match_destinations("Hunza aur Fairy Meadows jana hai") == ["hunza", "fairy-meadows"]
    assert data.resolve_destination("Karimabad") == "hunza"
    assert data.resolve_destination("fairy meadows") == "fairy-meadows"
    assert data.resolve_destination("Paris") is None


def test_every_destination_is_reachable_on_the_road_graph():
    for d in data.dataset()["destinations"]:
        if d["id"] == "k2":
            assert planner.path("islamabad", "askole")
            continue
        assert planner.path("islamabad", d["sleep_hub"]), d["id"]
