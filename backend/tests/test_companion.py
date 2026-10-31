"""Safar Saathi API: group settings, offline expense sync without duplicates, and nudge wording."""
import uuid
from datetime import datetime, timedelta, timezone

import config
from conftest import FakeResponse, say

TRIP = {"origin": "Islamabad", "destinations": ["skardu"], "days": 5, "adults": 3, "budget_pkr": 150000}
SETTINGS = {"members": [{"id": "m1", "name": "Qamar"}, {"id": "m2", "name": "Sara"}, {"id": "m3", "name": "Ali"}],
            "budgetTotal": 150000, "budgetBasis": "total", "startDate": "2026-11-10", "language": "ur"}
T0 = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)


def saved(client):
    r = client.post("/api/trips", json={"request": TRIP}).get_json()
    return r["trip"]["id"], {"X-Trip-Token": r["token"]}


def expense(amount=2400, *, id=None, at=T0, **kw):
    return {"id": id or str(uuid.uuid4()), "amountPkr": amount, "category": "food", "paidBy": "m1", "splitAmong": [],
            "dayIndex": 1, "createdAt": at.isoformat(), "updatedAt": at.isoformat(), "syncStatus": "pending", **kw}


def test_settings_need_the_trip_key_and_are_validated(client):
    tid, key = saved(client)
    assert client.put(f"/api/trips/{tid}/companion", json=SETTINGS).status_code == 401
    assert client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers={"X-Trip-Token": "x" * 32}).status_code == 404
    dup = {**SETTINGS, "members": [{"id": "m1", "name": "A"}, {"id": "m1", "name": "B"}]}
    assert client.put(f"/api/trips/{tid}/companion", json=dup, headers=key).status_code == 400
    health = {**SETTINGS, "asthma": True}
    assert client.put(f"/api/trips/{tid}/companion", json=health, headers=key).status_code == 400   # no extra data
    assert client.get(f"/api/trips/{tid}/companion", headers=key).get_json()["settings"] is None
    r = client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    assert r.status_code == 200
    got = client.get(f"/api/trips/{tid}/companion", headers=key).get_json()
    assert [m["name"] for m in got["settings"]["members"]] == ["Qamar", "Sara", "Ali"] and got["expenses"] == []


def test_the_same_expense_sent_twice_is_stored_once(client):
    tid, key = saved(client)
    client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    e = expense()
    for _ in range(3):                                       # a phone retrying after a lost connection
        r = client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [e]}, headers=key)
        assert r.status_code == 200
    assert len(r.get_json()["expenses"]) == 1 and r.get_json()["expenses"][0]["amountPkr"] == 2400


def test_sync_times_keep_milliseconds_like_the_phone(client):
    tid, key = saved(client)
    client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    at = datetime(2026, 11, 10, 9, 0, 1, 234000, tzinfo=timezone.utc)
    out = client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [expense(at=at)]}, headers=key).get_json()
    assert out["expenses"][0]["updatedAt"] == "2026-11-10T09:00:01.234+00:00"


def test_later_change_wins_and_deletes_reach_other_phones(client):
    tid, key = saved(client)
    client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    e = expense(1000)
    client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [e]}, headers=key)
    newer = {**e, "amountPkr": 1200, "updatedAt": (T0 + timedelta(minutes=5)).isoformat()}
    older = {**e, "amountPkr": 999, "updatedAt": (T0 - timedelta(minutes=5)).isoformat()}
    client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [newer]}, headers=key)
    out = client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [older]}, headers=key).get_json()
    assert out["expenses"][0]["amountPkr"] == 1200
    gone = {**newer, "deleted": True, "updatedAt": (T0 + timedelta(minutes=9)).isoformat()}
    out = client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [gone]}, headers=key).get_json()
    assert out["expenses"][0]["deleted"] is True                 # kept as a tombstone for other phones


def test_sync_refuses_strangers_bad_amounts_and_other_trips(client):
    tid, key = saved(client)
    other, other_key = saved(client)
    client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    assert client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [expense(0)]}, headers=key).status_code == 400
    assert client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [expense(id="not-a-uuid")]},
                       headers=key).status_code == 400
    naive = expense()
    naive["updatedAt"] = "2026-11-10T09:00:00"
    assert client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [naive]}, headers=key).status_code == 400
    out = client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [expense(paidBy="zz")]}, headers=key).get_json()
    assert out["expenses"] == [] and "not in this group" in out["rejected"][0]["reason"]
    shared = expense()
    client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [shared]}, headers=key)
    out = client.post(f"/api/trips/{other}/expenses/sync", json={"expenses": [shared]}, headers=other_key).get_json()
    assert out["expenses"] == [] and out["rejected"][0]["reason"] == "This id belongs to another trip."
    assert client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": []}).status_code == 401


def test_deleting_the_trip_deletes_its_expenses(client):
    tid, key = saved(client)
    client.put(f"/api/trips/{tid}/companion", json=SETTINGS, headers=key)
    e = expense()
    client.post(f"/api/trips/{tid}/expenses/sync", json={"expenses": [e]}, headers=key)
    assert client.delete(f"/api/trips/{tid}", headers=key).status_code == 204
    tid2, key2 = saved(client)
    out = client.post(f"/api/trips/{tid2}/expenses/sync", json={"expenses": [e]}, headers=key2).get_json()
    assert len(out["expenses"]) == 1                          # the old row is really gone


def test_without_a_database_the_companion_says_so(client):
    import storage
    storage.reset_for_tests(None)
    r = client.get("/api/trips/" + "a" * 32 + "/companion", headers={"X-Trip-Token": "x" * 32})
    assert r.status_code == 503


TEMPLATE = "Qamar, Din 4 tak 68% budget lag chuka hai (plan: 40%)."


def test_wording_without_ai_returns_the_template(client):
    r = client.post("/api/companion/wording", json={"ruleId": "R1", "language": "ur", "text": TEMPLATE}).get_json()
    assert r == {"text": TEMPLATE, "mode": "template", "reason": "AI not configured"}


def test_ai_wording_is_kept_only_with_the_same_numbers(client, ai):
    ai.script([say("Qamar yaar, Din 4 tak 68% budget nikal gaya, jabke plan 40% ka tha.")])
    r = client.post("/api/companion/wording", json={"ruleId": "R1", "language": "ur", "text": TEMPLATE}).get_json()
    assert r["mode"] == "ai" and "68%" in r["text"]
    ai.script([say("Qamar, Din 4 tak 70% budget lag gaya (plan: 40%).")])            # changed a number
    r = client.post("/api/companion/wording", json={"ruleId": "R1", "language": "ur", "text": TEMPLATE}).get_json()
    assert r["mode"] == "template" and r["reason"] == "AI changed the numbers"
    ai.script([say("قمر، دن 4 تک 68% بجٹ لگ گیا (پلان: 40%)۔")])                      # wrong script
    r = client.post("/api/companion/wording", json={"ruleId": "R1", "language": "ur", "text": TEMPLATE}).get_json()
    assert r["mode"] == "template" and r["reason"] == "AI used Urdu script"
    ai.script([FakeResponse(status=503), FakeResponse(status=503)])
    r = client.post("/api/companion/wording", json={"ruleId": "R1", "language": "en", "text": TEMPLATE}).get_json()
    assert r["mode"] == "template"


def test_wording_input_is_bounded(client):
    assert client.post("/api/companion/wording", json={"ruleId": "R9", "text": "x"}).status_code == 400
    assert client.post("/api/companion/wording", json={"ruleId": "R1", "text": "x" * 401}).status_code == 400
    assert config.COMPANION_RATE_PER_MIN > 0
