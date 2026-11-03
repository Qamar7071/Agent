"""Family share ("Where we'll be"): a read-only link with towns and dates only, revocable."""
import storage

TRIP = {"origin": "Islamabad", "destinations": ["hunza", "attabad"], "days": 7, "adults": 3, "budget_pkr": 250000,
        "start_date": "2026-11-20"}


def saved(client, request=TRIP):
    r = client.post("/api/trips", json={"request": request}).get_json()
    return r["trip"]["id"], {"X-Trip-Token": r["token"]}


def test_family_sees_towns_and_dates_but_no_costs_or_names(client):
    tid, key = saved(client)
    r = client.post(f"/api/trips/{tid}/share", json={"note": "Driver Akbar: 0300 0000000"}, headers=key)
    assert r.status_code == 201
    body = r.get_json()
    assert body["path"] == f"/s/{body['token']}" and "nothing else" in body["note"]
    view = client.get(f"/api/share/{body['token']}").get_json()
    assert view["title"] and len(view["days"]) == 7
    assert view["days"][0]["date"] == "2026-11-20" and view["days"][6]["date"] == "2026-11-26"
    assert view["days"][0]["night"] == "Chilas"
    assert any(d["night"] and "Hunza" in d["night"] for d in view["days"])
    assert view["note"] == "Driver Akbar: 0300 0000000"
    text = str(view)
    for private in ("budget", "total", "per_person", "cost", "Rs ", "token", "adults"):
        assert private not in text, private


def test_a_new_link_replaces_the_old_one_and_stopping_works(client):
    tid, key = saved(client)
    first = client.post(f"/api/trips/{tid}/share", json={}, headers=key).get_json()["token"]
    second = client.post(f"/api/trips/{tid}/share", json={}, headers=key).get_json()["token"]
    assert client.get(f"/api/share/{first}").status_code == 404
    assert client.get(f"/api/share/{second}").status_code == 200
    assert client.delete(f"/api/trips/{tid}/share", headers=key).status_code == 204
    gone = client.get(f"/api/share/{second}")
    assert gone.status_code == 404 and "stopped or replaced" in gone.get_json()["error"]["message"]


def test_only_the_trips_key_can_share_and_bad_links_are_refused(client):
    tid, key = saved(client)
    assert client.post(f"/api/trips/{tid}/share", json={}, headers={"X-Trip-Token": "x" * 32}).status_code == 404
    assert client.post(f"/api/trips/{tid}/share", json={}).status_code == 401
    assert client.post(f"/api/trips/{tid}/share", json={"note": "x" * 301}, headers=key).status_code == 400
    assert client.post(f"/api/trips/{tid}/share", json={"extra": 1}, headers=key).status_code == 400
    assert client.get("/api/share/short").status_code == 404
    assert client.get("/api/share/" + "a" * 24).status_code == 404


def test_dates_come_from_the_started_trip_when_the_plan_has_none(client):
    tid, key = saved(client, {**TRIP, "start_date": None})
    token = client.post(f"/api/trips/{tid}/share", json={}, headers=key).get_json()["token"]
    assert client.get(f"/api/share/{token}").get_json()["days"][0]["date"] is None
    settings = {"members": [{"id": "m1", "name": "Qamar"}], "budgetTotal": 250000, "startDate": "2026-12-01"}
    put = client.put(f"/api/trips/{tid}/companion", json=settings, headers=key)
    assert put.status_code == 200, put.get_json()
    view = client.get(f"/api/share/{token}").get_json()
    assert view["start_date"] == "2026-12-01" and view["days"][1]["date"] == "2026-12-02"


def test_deleting_the_trip_deletes_its_link(client):
    tid, key = saved(client)
    token = client.post(f"/api/trips/{tid}/share", json={}, headers=key).get_json()["token"]
    assert client.delete(f"/api/trips/{tid}", headers=key).status_code == 204
    assert client.get(f"/api/share/{token}").status_code == 404
    with storage.engine().connect() as c:
        assert c.execute(storage.select(storage.trip_shares)).first() is None
