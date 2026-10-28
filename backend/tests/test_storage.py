"""Saved trips and enquiries: private keys, hashing, withdrawal, admin updates.

Runs on SQLite by default. Set RAAHI_TEST_PG_URL=postgresql://… to run the same tests on Postgres.
"""
import os
import re

import pytest

import storage

BACKENDS = ["sqlite"] + (["postgres"] if os.environ.get("RAAHI_TEST_PG_URL") else [])


@pytest.fixture(params=BACKENDS)
def db(request, tmp_path):
    if request.param == "postgres":
        storage.reset_for_tests(os.environ["RAAHI_TEST_PG_URL"])
        with storage.engine().begin() as c:
            c.execute(storage.enquiries.delete())
            c.execute(storage.trips.delete())
    return request.param


def test_trip_needs_its_private_key(db):
    trip, token = storage.create_trip("Hunza", {"destinations": ["hunza"]}, {"days": []})
    assert re.fullmatch(r"[0-9a-f]{32}", trip["id"]) and len(token) >= 30
    with storage.engine().connect() as c:
        row = c.execute(storage.trips.select()).first()
    assert token not in row.token_hash and len(row.token_hash) == 64      # only the hash is stored
    assert storage.get_trip(trip["id"], token)["title"] == "Hunza"
    for bad in ("", "x" * 32, token[:-1] + ("A" if token[-1] != "A" else "B")):
        with pytest.raises(storage.NotFound):
            storage.get_trip(trip["id"], bad)


def test_trip_update_and_delete(db):
    trip, token = storage.create_trip("Old", {"a": 1}, {"days": []})
    updated = storage.update_trip(trip["id"], token, "New", {"a": 2}, {"days": [1]})
    assert updated["title"] == "New" and updated["request"] == {"a": 2}
    storage.delete_trip(trip["id"], token)
    with pytest.raises(storage.NotFound):
        storage.get_trip(trip["id"], token)


def _enquiry(**kw):
    base = dict(name="Ali", contact_method="email", contact_value="ali@example.com", message="Hi",
                request={"destinations": ["hunza"]}, summary="Hunza: 6 days", trip_id=None,
                consent_text="I agree", consent_version="2026-10-27")
    base.update(kw)
    return storage.create_enquiry(**base)


def test_enquiry_reference_status_and_withdrawal(db):
    record, token = _enquiry()
    assert re.fullmatch(r"RAH-[A-Z2-9]{4}-[A-Z2-9]{4}", record["reference"])
    assert record["status"] == "new" and "contact_value" not in record          # public view hides contact details
    assert storage.get_enquiry(record["reference"].lower(), token)["reference"] == record["reference"]
    with pytest.raises(storage.NotFound):
        storage.get_enquiry(record["reference"], "wrong-token-wrong-token")
    storage.withdraw_enquiry(record["reference"], token)
    with pytest.raises(storage.NotFound):
        storage.get_enquiry(record["reference"], token)


def test_admin_sees_details_and_can_update_status(db):
    record, _ = _enquiry()
    listed = storage.list_enquiries()
    assert listed[0]["contact_value"] == "ali@example.com" and listed[0]["consent_version"] == "2026-10-27"
    updated = storage.admin_update_enquiry(record["reference"], "contacted", "Sent options by email")
    assert updated["status"] == "contacted" and updated["admin_note"] == "Sent options by email"
    assert storage.list_enquiries("contacted") and not storage.list_enquiries("new")
    with pytest.raises(storage.NotFound):
        storage.admin_update_enquiry("RAH-AAAA-AAAA", "closed", None)


def test_deleting_a_trip_keeps_its_enquiry(db):
    trip, token = storage.create_trip("T", {}, {})
    record, etoken = _enquiry(trip_id=trip["id"])
    storage.delete_trip(trip["id"], token)
    assert storage.get_enquiry(record["reference"], etoken)["status"] == "new"


def test_storage_disabled_raises_clearly():
    storage.reset_for_tests(None)
    assert storage.enabled() is False
    with pytest.raises(storage.StorageUnavailable):
        storage.create_trip("x", {}, {})


def test_schema_sql_matches_the_tables():
    sql = storage.schema_sql()
    assert "CREATE TABLE trips" in sql and "CREATE TABLE enquiries" in sql
    assert "FOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE SET NULL" in sql
    assert "UNIQUE (reference)" in sql and "CREATE INDEX ix_enquiries_status_created" in sql
