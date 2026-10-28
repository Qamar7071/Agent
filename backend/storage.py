"""Persistence for saved trips and booking enquiries (SQLAlchemy Core).

- Postgres in production (DATABASE_URL, e.g. Neon, Supabase or Vercel Postgres), SQLite locally.
- Without a database (e.g. on Vercel with no DATABASE_URL) every call raises
  StorageUnavailable, and the API answers 503 with an honest message instead of pretending.

Access control without accounts: creating a trip or an enquiry returns a random secret
token once. Only its SHA-256 hash is stored, and every read, change or delete must present
the token (compared in constant time). Admins use ADMIN_TOKEN (see security.py).
"""
import hashlib
import hmac
import json
import logging
import secrets
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import (Column, DateTime, ForeignKey, Index, MetaData, String, Table, Text, create_engine, delete,
                        insert, select, update)
from sqlalchemy.pool import NullPool

import config

log = logging.getLogger("raahi.storage")
metadata = MetaData()

trips = Table(
    "trips", metadata,
    Column("id", String(32), primary_key=True),
    Column("token_hash", String(64), nullable=False),
    Column("title", String(160), nullable=False),
    Column("request_json", Text, nullable=False),
    Column("itinerary_json", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

enquiries = Table(
    "enquiries", metadata,
    Column("id", String(32), primary_key=True),
    Column("reference", String(16), nullable=False, unique=True),
    Column("token_hash", String(64), nullable=False),
    Column("trip_id", String(32), ForeignKey("trips.id", ondelete="SET NULL"), nullable=True),
    Column("name", String(80), nullable=False),
    Column("contact_method", String(16), nullable=False),
    Column("contact_value", String(120), nullable=False),
    Column("message", Text, nullable=True),
    Column("request_json", Text, nullable=True),
    Column("summary", String(300), nullable=True),
    Column("consent_text", Text, nullable=False),
    Column("consent_version", String(20), nullable=False),
    Column("consent_at", DateTime(timezone=True), nullable=False),
    Column("status", String(16), nullable=False),
    Column("admin_note", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
Index("ix_enquiries_status_created", enquiries.c.status, enquiries.c.created_at)

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O or 1/I look-alikes
_engine = None
_lock = threading.Lock()


class StorageUnavailable(RuntimeError):
    pass


class NotFound(LookupError):
    pass


def enabled() -> bool:
    return config.STORAGE_ENABLED


def kind() -> str | None:
    if not config.DATABASE_URL:
        return None
    return "sqlite" if config.DATABASE_URL.startswith("sqlite") else "postgres"


def _url(raw: str) -> str:
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://"):]
    return raw


def engine():
    global _engine
    if not enabled():
        raise StorageUnavailable("Saving is not available on this deployment yet (no database is configured).")
    with _lock:
        if _engine is None:
            url = _url(config.DATABASE_URL)
            kw = {"pool_pre_ping": True, "future": True}
            if url.startswith("sqlite"):
                kw["connect_args"] = {"check_same_thread": False}
            elif config.ON_VERCEL:
                kw["poolclass"] = NullPool          # short-lived serverless instances
            _engine = create_engine(url, **kw)
            metadata.create_all(_engine)
    return _engine


def reset_for_tests(url: str | None) -> None:
    """Point storage at another database (tests only)."""
    global _engine
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None
    config.DATABASE_URL = url or ""
    config.STORAGE_ENABLED = bool(url)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _check(row, token: str) -> bool:
    return bool(row) and hmac.compare_digest(row.token_hash, _hash(token or ""))


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:                     # SQLite returns naive datetimes
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds")


# ── Trips ─────────────────────────────────────────────────────────────────────────
def _trip_out(row) -> dict:
    return {"id": row.id, "title": row.title, "request": json.loads(row.request_json),
            "itinerary": json.loads(row.itinerary_json), "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at)}


def create_trip(title: str, request: dict, itinerary: dict) -> tuple[dict, str]:
    token = secrets.token_urlsafe(24)
    now = _now()
    row = {"id": uuid.uuid4().hex, "token_hash": _hash(token), "title": title[:160],
           "request_json": json.dumps(request, ensure_ascii=False),
           "itinerary_json": json.dumps(itinerary, ensure_ascii=False), "created_at": now, "updated_at": now}
    with engine().begin() as c:
        c.execute(insert(trips).values(**row))
    return {"id": row["id"], "title": row["title"], "request": request, "itinerary": itinerary,
            "created_at": _iso(now), "updated_at": _iso(now)}, token


def get_trip(trip_id: str, token: str) -> dict:
    with engine().connect() as c:
        row = c.execute(select(trips).where(trips.c.id == trip_id)).first()
    if not _check(row, token):
        raise NotFound("Trip not found, or this link's key does not match.")
    return _trip_out(row)


def update_trip(trip_id: str, token: str, title: str, request: dict, itinerary: dict) -> dict:
    get_trip(trip_id, token)
    now = _now()
    with engine().begin() as c:
        c.execute(update(trips).where(trips.c.id == trip_id).values(
            title=title[:160], request_json=json.dumps(request, ensure_ascii=False),
            itinerary_json=json.dumps(itinerary, ensure_ascii=False), updated_at=now))
    return get_trip(trip_id, token)


def delete_trip(trip_id: str, token: str) -> None:
    get_trip(trip_id, token)
    with engine().begin() as c:
        c.execute(update(enquiries).where(enquiries.c.trip_id == trip_id).values(trip_id=None))
        c.execute(delete(trips).where(trips.c.id == trip_id))


# ── Enquiries ─────────────────────────────────────────────────────────────────────
def _reference() -> str:
    raw = "".join(secrets.choice(REF_ALPHABET) for _ in range(8))
    return f"RAH-{raw[:4]}-{raw[4:]}"


def _enquiry_public(row) -> dict:
    return {"reference": row.reference, "status": row.status, "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at), "summary": row.summary, "name": row.name,
            "contact_method": row.contact_method}


def _enquiry_admin(row) -> dict:
    out = _enquiry_public(row)
    out.update(contact_value=row.contact_value, message=row.message, trip_id=row.trip_id,
               request=json.loads(row.request_json) if row.request_json else None, admin_note=row.admin_note,
               consent_version=row.consent_version, consent_at=_iso(row.consent_at))
    return out


def create_enquiry(*, name: str, contact_method: str, contact_value: str, message: str | None,
                   request: dict | None, summary: str | None, trip_id: str | None,
                   consent_text: str, consent_version: str) -> tuple[dict, str]:
    token = secrets.token_urlsafe(24)
    now = _now()
    for _ in range(5):          # reference collisions are astronomically rare, but be safe
        ref = _reference()
        try:
            with engine().begin() as c:
                c.execute(insert(enquiries).values(
                    id=uuid.uuid4().hex, reference=ref, token_hash=_hash(token), trip_id=trip_id, name=name,
                    contact_method=contact_method, contact_value=contact_value, message=message,
                    request_json=json.dumps(request, ensure_ascii=False) if request else None,
                    summary=(summary or "")[:300] or None, consent_text=consent_text,
                    consent_version=consent_version, consent_at=now, status="new", admin_note=None,
                    created_at=now, updated_at=now))
            break
        except Exception as exc:  # unique violation on reference -> retry
            if "unique" not in str(exc).lower():
                raise
    else:
        raise RuntimeError("Could not allocate an enquiry reference.")
    return get_enquiry(ref, token), token


def get_enquiry(reference: str, token: str) -> dict:
    with engine().connect() as c:
        row = c.execute(select(enquiries).where(enquiries.c.reference == reference.upper())).first()
    if not _check(row, token):
        raise NotFound("Enquiry not found, or this key does not match.")
    return _enquiry_public(row)


def withdraw_enquiry(reference: str, token: str) -> None:
    """Delete an enquiry and the personal details in it (the traveller's right to withdraw)."""
    get_enquiry(reference, token)
    with engine().begin() as c:
        c.execute(delete(enquiries).where(enquiries.c.reference == reference.upper()))


def list_enquiries(status: str | None = None, limit: int = 100) -> list[dict]:
    q = select(enquiries).order_by(enquiries.c.created_at.desc()).limit(max(1, min(limit, 500)))
    if status:
        q = q.where(enquiries.c.status == status)
    with engine().connect() as c:
        return [_enquiry_admin(r) for r in c.execute(q)]


def admin_update_enquiry(reference: str, status: str | None, admin_note: str | None) -> dict:
    values = {"updated_at": _now()}
    if status:
        values["status"] = status
    if admin_note is not None:
        values["admin_note"] = admin_note
    with engine().begin() as c:
        res = c.execute(update(enquiries).where(enquiries.c.reference == reference.upper()).values(**values))
        if res.rowcount == 0:
            raise NotFound("Enquiry not found.")
        row = c.execute(select(enquiries).where(enquiries.c.reference == reference.upper())).first()
    return _enquiry_admin(row)


def schema_sql() -> str:
    """The CREATE statements for Postgres, for review or for creating the tables by hand."""
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateIndex, CreateTable

    out = []
    for table in metadata.sorted_tables:
        out.append(str(CreateTable(table).compile(dialect=postgresql.dialect())).strip() + ";")
        out += [str(CreateIndex(ix).compile(dialect=postgresql.dialect())).strip() + ";" for ix in table.indexes]
    return "\n\n".join(out) + "\n"


if __name__ == "__main__":
    # python storage.py init  -> create any missing tables in DATABASE_URL (safe to run again)
    # python storage.py sql   -> print the Postgres CREATE statements
    import sys

    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "sql":
        print(schema_sql(), end="")
    elif command == "init":
        engine()
        print(f"Tables are ready in the {kind()} database.")
    else:
        print("usage: python storage.py init | sql")
        sys.exit(2)
