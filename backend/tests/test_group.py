"""Group Room: joining, privacy of comfort needs, consensus options, votes, confirming, shared expenses;
and the planner's acclimatisation rule that group needs rely on."""
import json
import uuid
from datetime import datetime, timezone

import storage
from group.consensus import propose
from planner import build
from schemas import TripRequest

TRIP = {"origin": "Gilgit", "destinations": ["hunza", "khunjerab"], "days": 5, "adults": 4, "budget_pkr": 200000}


def organizer(client, request=TRIP):
    r = client.post("/api/trips", json={"request": request}).get_json()
    tid, token = r["trip"]["id"], r["token"]
    g = client.post("/api/groups", json={"tripId": tid, "tripType": "friends", "name": "Qamar"},
                    headers={"X-Trip-Token": token})
    assert g.status_code == 201
    out = g.get_json()
    return tid, {"X-Trip-Token": token}, out["code"], {"X-Member-Token": out["member"]["token"]}


def join(client, code, name):
    r = client.post(f"/api/groups/{code}/join", json={"name": name})
    assert r.status_code == 201
    return {"X-Member-Token": r.get_json()["member"]["token"]}


# ── planner: acclimatisation ─────────────────────────────────────────────────────────
def test_altitude_need_adds_a_rest_day_before_going_above_4000_m():
    plain = build(TripRequest(origin="Skardu", destinations=["deosai"], days=3, travel_month=7))
    careful = build(TripRequest(origin="Skardu", destinations=["deosai"], days=3, travel_month=7,
                                accessibility=["altitude_sensitive"]))
    assert plain["days"][0]["title"].startswith("Deosai")
    assert careful["days"][0]["title"] == "Rest day in Skardu" and len(careful["days"]) == 4
    reason = next(w for w in careful["warnings"] if w["code"] == "acclimatise")["message"]
    assert "sensitive to altitude" in reason and "4,114 m" in reason


def test_no_change_when_the_group_is_already_acclimatised():
    p = build(TripRequest(origin="Islamabad", destinations=["skardu", "deosai"], days=8, travel_month=7,
                          accessibility=["altitude_sensitive"]))
    assert not [w for w in p["warnings"] if w["code"] == "acclimatise"] and len(p["days"]) == 8


# ── joining and privacy ──────────────────────────────────────────────────────────────
def test_join_with_just_a_name_and_see_only_what_members_may_see(client):
    _, trip_h, code, org_h = organizer(client)
    pre = client.get(f"/api/groups/{code}/preview").get_json()
    assert pre["organizer"] == "Qamar" and pre["members"] == 1 and "members_list" not in pre
    assert client.get(f"/api/groups/{code.lower()[:4]}-{code.lower()[4:]}/preview").status_code == 200
    sara = join(client, code, "Sara")
    assert client.get(f"/api/groups/{code}").status_code == 401
    assert client.get(f"/api/groups/{code}", headers={"X-Member-Token": "x" * 32}).status_code == 403
    view = client.get(f"/api/groups/{code}", headers=sara).get_json()
    assert [m["name"] for m in view["members"]] == ["Qamar", "Sara"] and view["you"]["organizer"] is False
    assert client.get(f"/api/groups/{code}", headers=trip_h).get_json()["you"]["organizer"] is True
    assert client.get("/api/groups/WRONG123/preview").status_code == 404


def test_needs_are_anonymous_unless_the_member_chooses_to_show_a_name(client):
    _, _, code, org_h = organizer(client)
    sara, ali = join(client, code, "Sara"), join(client, code, "Ali")
    client.put(f"/api/groups/{code}/needs", json={"codes": ["breathing", "food_vegetarian"]}, headers=sara)
    client.put(f"/api/groups/{code}/needs", json={"codes": ["food_vegetarian"], "show_name": True}, headers=ali)
    needs = {n["code"]: n for n in client.get(f"/api/groups/{code}", headers=org_h).get_json()["needs"]}
    assert needs["breathing"] == {"code": "breathing", "count": 1, "names": []}
    assert needs["food_vegetarian"]["count"] == 2 and needs["food_vegetarian"]["names"] == ["Ali"]
    # in the database a need is not linked to a member: no member id, and not the member's key hash
    with storage.engine().connect() as c:
        rows = c.execute(storage.group_needs.select()).all()
        member_hashes = {r.token_hash for r in c.execute(storage.group_members.select()).all()}
        member_ids = {r.id for r in c.execute(storage.group_members.select()).all()}
    assert all(r.owner not in member_hashes and r.owner not in member_ids for r in rows)
    assert {r.display_name for r in rows} == {None, "Ali"}
    # replacing and leaving remove the member's own needs only
    client.put(f"/api/groups/{code}/needs", json={"codes": []}, headers=sara)
    needs = {n["code"]: n for n in client.get(f"/api/groups/{code}", headers=org_h).get_json()["needs"]}
    assert "breathing" not in needs and needs["food_vegetarian"]["count"] == 1
    assert client.post(f"/api/groups/{code}/leave", headers=ali).status_code == 204
    assert client.get(f"/api/groups/{code}", headers=org_h).get_json()["needs"] == []
    assert client.put(f"/api/groups/{code}/needs", json={"codes": ["diagnosis"]}, headers=sara).status_code == 400


# ── options, votes, confirm ──────────────────────────────────────────────────────────
PROFILES = [{"interests": ["lakes"], "budget_comfort": "tight", "pace": "balanced", "must_do": [], "no_go": []},
            {"interests": ["culture"], "budget_comfort": "tight", "pace": "relaxed", "must_do": ["attabad"], "no_go": []}]


def test_organizer_gets_options_members_vote_organizer_confirms(client):
    tid, trip_h, code, org_h = organizer(client)
    sara = join(client, code, "Sara")
    client.put(f"/api/groups/{code}/profile", json=PROFILES[0], headers=org_h)
    client.put(f"/api/groups/{code}/profile", json=PROFILES[1], headers=sara)
    client.put(f"/api/groups/{code}/needs", json={"codes": ["altitude"]}, headers=sara)
    assert client.post(f"/api/groups/{code}/options", headers=sara).status_code == 403     # only the organizer
    out = client.post(f"/api/groups/{code}/options", headers=org_h).get_json()
    assert 2 <= len(out["options"]) <= 3 and out["recommended"] in {o["id"] for o in out["options"]}
    for o in out["options"]:
        assert 0 <= o["match"] <= 100 and isinstance(o["sacrifices"], list) and o["per_person"] > 0
    a = out["options"][0]
    assert "attabad" in a["request"]["destinations"]                      # a member's must-do
    assert "altitude_sensitive" in a["request"]["accessibility"]          # the anonymous need became a rule
    assert any("sensitive to altitude" in w or "full day" in w for w in a["why"])   # the plan changed visibly, with a reason
    assert any(d["title"].startswith("Rest day") for d in a["days"])
    run = client.get(f"/api/groups/{code}/run", headers=sara).get_json()["run"]
    kinds = {m["type"] for m in run["messages"]}
    assert kinds == {"proposal", "concern", "decision"}
    assert not any("Sara" in json.dumps(m) for m in run["messages"])     # no names next to needs
    assert client.post(f"/api/groups/{code}/vote", json={"option": "Z"}, headers=sara).status_code == 400
    client.post(f"/api/groups/{code}/vote", json={"option": a["id"]}, headers=sara)
    view = client.get(f"/api/groups/{code}", headers=org_h).get_json()
    assert view["status"] == "voting" and view["votes"][a["id"]] == {"count": 1, "names": ["Sara"]}
    assert client.post(f"/api/groups/{code}/confirm", json={"option": a["id"]}, headers=sara).status_code == 403
    done = client.post(f"/api/groups/{code}/confirm", json={"option": a["id"]}, headers=org_h).get_json()
    assert done["chosen"] == a["id"]
    trip = client.get(f"/api/trips/{tid}", headers=trip_h).get_json()["trip"]
    assert "attabad" in trip["request"]["destinations"]
    plan = client.get(f"/api/groups/{code}/plan", headers=sara).get_json()
    assert plan["trip_id"] == tid and plan["itinerary"]["days"]


def test_members_share_the_trip_expenses_from_their_own_phones(client):
    tid, trip_h, code, org_h = organizer(client)
    sara = join(client, code, "Sara")
    view = client.get(f"/api/groups/{code}", headers=org_h).get_json()
    members = [{"id": m["id"], "name": m["name"]} for m in view["members"]]
    assert client.put(f"/api/trips/{tid}/companion", json={"members": members}, headers=sara).status_code == 200
    now = datetime.now(timezone.utc).isoformat()
    e = {"id": str(uuid.uuid4()), "amountPkr": 3000, "category": "food", "paidBy": members[1]["id"], "splitAmong": [],
         "dayIndex": 1, "createdAt": now, "updatedAt": now}
    assert client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [e]}, headers=sara).status_code == 200
    got = client.get(f"/api/trips/{tid}/companion", headers=trip_h).get_json()
    assert [x["amountPkr"] for x in got["expenses"]] == [3000]
    _, _, other_code, _ = organizer(client)
    stranger = join(client, other_code, "Stranger")
    assert client.get(f"/api/trips/{tid}/companion", headers=stranger).status_code == 404
    client.post(f"/api/groups/{code}/leave", headers=sara)
    assert client.get(f"/api/trips/{tid}/companion", headers=sara).status_code == 404


def test_group_needs_a_database(client):
    storage.reset_for_tests(None)
    assert client.get("/api/groups/ABCDEFGH/preview").status_code == 503


# ── consensus logic ──────────────────────────────────────────────────────────────────
def test_a_breathing_need_keeps_long_hikes_out_and_says_whose_must_do_was_dropped():
    base = {"origin": "Islamabad", "destinations": ["skardu"], "days": 9, "adults": 3}
    profiles = [{"pace": "active", "must_do": ["fairy-meadows"]}, {"pace": "balanced"}, {"pace": "balanced"}]
    out = propose(base, "friends", profiles, {"breathing": 1})
    a = out["options"][0]
    assert "fairy-meadows" not in a["request"]["destinations"]
    assert any("Fairy Meadows, a must-do for 1 member" in s for s in a["sacrifices"])
    msgs = [m for m in out["run"]["messages"] if "left out" in m["summary"]]
    assert msgs and msgs[0]["resolvesEventId"]                       # it answers the safety concern


def test_tight_budgets_lift_the_budget_version():
    base = {"origin": "Islamabad", "destinations": ["hunza"], "days": 6, "adults": 4, "accommodation": "mid"}
    profiles = [{"budget_comfort": "tight"}] * 3 + [{"budget_comfort": "comfortable"}]
    out = propose(base, "friends", profiles, {})
    kinds = [o["kind"] for o in out["options"]]
    assert "budget" in kinds
    cheap = next(o for o in out["options"] if o["kind"] == "budget")
    assert cheap["per_person"] < out["options"][0]["per_person"]
    assert out["recommended"] == cheap["id"] or cheap["match"] <= out["options"][0]["match"]
