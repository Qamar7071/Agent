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

from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Index, Integer, MetaData, String, Table, Text,
                        create_engine, delete, insert, select, update)
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

# Safar Saathi (trip companion): the group's settings and its shared expenses for a saved trip.
companions = Table(
    "companions", metadata,
    Column("trip_id", String(32), ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
    Column("settings_json", Text, nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

expenses = Table(
    "expenses", metadata,
    Column("id", String(36), primary_key=True),          # made on the phone, so retries are idempotent
    Column("trip_id", String(32), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
    Column("amount_pkr", Integer, nullable=False),
    Column("category", String(16), nullable=False),
    Column("paid_by", String(12), nullable=False),
    Column("split_among", Text, nullable=False),
    Column("note", String(120), nullable=True),
    Column("day_index", Integer, nullable=False),
    Column("deleted", Boolean, nullable=False, default=False),   # kept as a tombstone so other phones learn of it
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
Index("ix_expenses_trip", expenses.c.trip_id)
MAX_EXPENSES_PER_TRIP = 3000

# Group Room: one trip planned by several people.
groups = Table(
    "groups", metadata,
    Column("id", String(32), primary_key=True),
    Column("code", String(8), nullable=False, unique=True),   # what people type or share: ABCD-EFGH
    Column("trip_id", String(32), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
    Column("trip_type", String(12), nullable=False),
    Column("status", String(12), nullable=False),              # gathering | voting | confirmed
    Column("options_json", Text, nullable=True),
    Column("run_json", Text, nullable=True),                   # the agents' real run behind the options
    Column("chosen", String(1), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

group_members = Table(
    "group_members", metadata,
    Column("id", String(12), primary_key=True),
    Column("group_id", String(32), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
    Column("name", String(40), nullable=False),
    Column("token_hash", String(64), nullable=False, unique=True),
    Column("is_organizer", Boolean, nullable=False, default=False),
    Column("profile_json", Text, nullable=True),
    Column("vote", String(1), nullable=True),
    Column("active", Boolean, nullable=False, default=True),
    Column("joined_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
Index("ix_group_members_group", group_members.c.group_id)

# Private comfort needs, stored WITHOUT a link to the member: `owner` is a hash of the member's
# own key (kept only on their phone) and the group id, different from the hash in group_members.
# The server can count needs, but can't tell whose they are; only the member's phone can find
# and delete its own. A name is stored only if the member chose to show it.
group_needs = Table(
    "group_needs", metadata,
    Column("id", String(32), primary_key=True),
    Column("group_id", String(32), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
    Column("owner", String(64), nullable=False),
    Column("code", String(24), nullable=False),
    Column("display_name", String(40), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
Index("ix_group_needs_group", group_needs.c.group_id)
MAX_MEMBERS = 20

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
        c.execute(delete(expenses).where(expenses.c.trip_id == trip_id))      # SQLite doesn't cascade by default
        c.execute(delete(companions).where(companions.c.trip_id == trip_id))
        for g in c.execute(select(groups.c.id).where(groups.c.trip_id == trip_id)).all():
            c.execute(delete(group_needs).where(group_needs.c.group_id == g.id))
            c.execute(delete(group_members).where(group_members.c.group_id == g.id))
        c.execute(delete(groups).where(groups.c.trip_id == trip_id))
        c.execute(delete(trips).where(trips.c.id == trip_id))


# ── Safar Saathi ──────────────────────────────────────────────────────────────────
def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso_ms(dt: datetime) -> str:
    """Millisecond precision, the same as the phone's clock: sync compares these times."""
    return _aware(dt).isoformat(timespec="milliseconds")


def _expense_out(row) -> dict:
    return {"id": row.id, "amountPkr": row.amount_pkr, "category": row.category, "paidBy": row.paid_by,
            "splitAmong": json.loads(row.split_among), "note": row.note, "dayIndex": row.day_index,
            "deleted": bool(row.deleted), "createdAt": _iso_ms(row.created_at), "updatedAt": _iso_ms(row.updated_at)}


def _auth_trip(trip_id: str, token: str | None, member_token: str | None = None) -> None:
    """The trip's own key, or the key of an active member of the trip's group."""
    if member_token and member_trip_access(trip_id, member_token):
        return
    get_trip(trip_id, token or "")


def get_companion(trip_id: str, token: str | None, member_token: str | None = None) -> dict:
    """The group's settings (or None before anyone pressed Start trip) and every expense, tombstones included."""
    _auth_trip(trip_id, token, member_token)
    with engine().connect() as c:
        row = c.execute(select(companions).where(companions.c.trip_id == trip_id)).first()
        rows = c.execute(select(expenses).where(expenses.c.trip_id == trip_id)
                         .order_by(expenses.c.created_at, expenses.c.id)).all()
    return {"settings": json.loads(row.settings_json) if row else None,
            "settings_updated_at": _iso(row.updated_at) if row else None,
            "expenses": [_expense_out(r) for r in rows]}


def put_companion_settings(trip_id: str, token: str | None, settings: dict, member_token: str | None = None) -> dict:
    _auth_trip(trip_id, token, member_token)
    now = _now()
    text = json.dumps(settings, ensure_ascii=False)
    with engine().begin() as c:
        exists = c.execute(select(companions.c.trip_id).where(companions.c.trip_id == trip_id)).first()
        if exists:
            c.execute(update(companions).where(companions.c.trip_id == trip_id).values(settings_json=text, updated_at=now))
        else:
            c.execute(insert(companions).values(trip_id=trip_id, settings_json=text, updated_at=now))
    return {"settings": settings, "settings_updated_at": _iso(now)}


def sync_expenses(trip_id: str, token: str | None, items: list[dict], member_token: str | None = None) -> dict:
    """Merge expenses sent by a phone. Same id twice = one expense (safe to retry after a lost
    connection). If two phones changed the same expense, the later change wins. An id that
    belongs to another trip is refused. Returns the trip's full list, tombstones included."""
    _auth_trip(trip_id, token, member_token)
    rejected = []
    with engine().begin() as c:
        count = len(c.execute(select(expenses.c.id).where(expenses.c.trip_id == trip_id)).all())
        for it in items:
            row = c.execute(select(expenses).where(expenses.c.id == it["id"])).first()
            values = {"amount_pkr": it["amountPkr"], "category": it["category"], "paid_by": it["paidBy"],
                      "split_among": json.dumps(it["splitAmong"]), "note": it.get("note"),
                      "day_index": it["dayIndex"], "deleted": bool(it.get("deleted")),
                      "updated_at": it["updatedAt"]}
            if row is None:
                if count >= MAX_EXPENSES_PER_TRIP:
                    rejected.append({"id": it["id"], "reason": "This trip has reached its expense limit."})
                    continue
                c.execute(insert(expenses).values(id=it["id"], trip_id=trip_id, created_at=it["createdAt"], **values))
                count += 1
            elif row.trip_id != trip_id:
                rejected.append({"id": it["id"], "reason": "This id belongs to another trip."})
            elif _aware(it["updatedAt"]) > _aware(row.updated_at):
                c.execute(update(expenses).where(expenses.c.id == it["id"]).values(**values))
    out = get_companion(trip_id, token, member_token)
    return {"expenses": out["expenses"], "rejected": rejected, "synced_at": _iso(_now())}


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


# ── Group Room ────────────────────────────────────────────────────────────────────
class Forbidden(PermissionError):
    pass


def _member_hash(token: str) -> str:
    return _hash("member:" + (token or ""))


def _need_owner(token: str, group_id: str) -> str:
    return _hash(f"need:{group_id}:{token or ''}")


def normalise_code(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch in REF_ALPHABET)[:8]


def _group(c, code: str):
    row = c.execute(select(groups).where(groups.c.code == normalise_code(code))).first()
    if row is None:
        raise NotFound("No group with this code. Check the link or ask the organizer for a new one.")
    return row


def _member(c, group_row, token: str | None):
    if not token:
        return None
    row = c.execute(select(group_members).where(group_members.c.token_hash == _member_hash(token))).first()
    if row is None or row.group_id != group_row.id or not row.active:
        return None
    return row


def _organizer(c, group_row, trip_token: str | None, member_token: str | None) -> bool:
    if trip_token:
        trip = c.execute(select(trips).where(trips.c.id == group_row.trip_id)).first()
        if _check(trip, trip_token):
            return True
    m = _member(c, group_row, member_token)
    return bool(m and m.is_organizer)


def create_group(trip_id: str, trip_token: str, trip_type: str, organizer_name: str) -> dict:
    trip = get_trip(trip_id, trip_token)
    now = _now()
    member_token = secrets.token_urlsafe(24)
    with engine().begin() as c:
        existing = c.execute(select(groups).where(groups.c.trip_id == trip_id)).first()
        if existing:
            gid, code = existing.id, existing.code
            c.execute(update(groups).where(groups.c.id == gid).values(trip_type=trip_type, updated_at=now))
            org = c.execute(select(group_members).where((group_members.c.group_id == gid)
                                                        & group_members.c.is_organizer)).first()
            if org:
                c.execute(update(group_members).where(group_members.c.id == org.id).values(
                    token_hash=_member_hash(member_token), name=organizer_name[:40], active=True, updated_at=now))
                return {"code": code, "member": {"id": org.id, "token": member_token}, "trip": trip["title"]}
        else:
            gid = uuid.uuid4().hex
            for _ in range(20):
                code = "".join(secrets.choice(REF_ALPHABET) for _ in range(8))
                if not c.execute(select(groups.c.id).where(groups.c.code == code)).first():
                    break
            c.execute(insert(groups).values(id=gid, code=code, trip_id=trip_id, trip_type=trip_type, status="gathering",
                                            created_at=now, updated_at=now))
        mid = secrets.token_hex(6)
        c.execute(insert(group_members).values(id=mid, group_id=gid, name=organizer_name[:40],
                                               token_hash=_member_hash(member_token), is_organizer=True, active=True,
                                               joined_at=now, updated_at=now))
    return {"code": code, "member": {"id": mid, "token": member_token}, "trip": trip["title"]}


def join_group(code: str, name: str) -> dict:
    now = _now()
    token = secrets.token_urlsafe(24)
    with engine().begin() as c:
        g = _group(c, code)
        if g.status == "confirmed":
            pass                                   # late joiners can still come along and split costs
        count = len(c.execute(select(group_members.c.id).where((group_members.c.group_id == g.id)
                                                               & group_members.c.active)).all())
        if count >= MAX_MEMBERS:
            raise Forbidden(f"This group is full ({MAX_MEMBERS} people).")
        mid = secrets.token_hex(6)
        c.execute(insert(group_members).values(id=mid, group_id=g.id, name=name[:40], token_hash=_member_hash(token),
                                               is_organizer=False, active=True, joined_at=now, updated_at=now))
        c.execute(update(groups).where(groups.c.id == g.id).values(updated_at=now))
    return {"code": g.code, "member": {"id": mid, "token": token}}


def group_preview(code: str) -> dict:
    """What someone with only the link sees before joining: no member names except the organizer."""
    with engine().connect() as c:
        g = _group(c, code)
        trip = c.execute(select(trips).where(trips.c.id == g.trip_id)).first()
        rows = c.execute(select(group_members).where((group_members.c.group_id == g.id) & group_members.c.active)).all()
    org = next((r.name for r in rows if r.is_organizer), None)
    return {"code": g.code, "title": trip.title if trip else "Trip", "trip_type": g.trip_type, "status": g.status,
            "organizer": org, "members": len(rows)}


def group_view(code: str, *, trip_token: str | None = None, member_token: str | None = None) -> dict:
    with engine().connect() as c:
        g = _group(c, code)
        me = _member(c, g, member_token)
        organizer = _organizer(c, g, trip_token, member_token)
        if not me and not organizer:
            raise Forbidden("Join the group first to see it.")
        trip = c.execute(select(trips).where(trips.c.id == g.trip_id)).first()
        rows = c.execute(select(group_members).where(group_members.c.group_id == g.id)
                         .order_by(group_members.c.joined_at)).all()
        needs = c.execute(select(group_needs).where(group_needs.c.group_id == g.id)).all()
    options = json.loads(g.options_json) if g.options_json else None
    tally = {}
    for r in rows:
        if r.active and r.vote:
            tally.setdefault(r.vote, []).append(r.name)
    from group.profiles import constraint_list
    return {
        "code": g.code, "trip_id": g.trip_id, "title": trip.title if trip else "Trip", "trip_type": g.trip_type,
        "status": g.status, "chosen": g.chosen,
        "request": json.loads(trip.request_json) if trip else None,
        "members": [{"id": r.id, "name": r.name, "organizer": bool(r.is_organizer), "active": bool(r.active),
                     "profile_done": bool(r.profile_json), "voted": bool(r.vote)} for r in rows],
        "needs": constraint_list([{"code": n.code, "display_name": n.display_name} for n in needs]),
        "options": options, "votes": {k: {"count": len(v), "names": v} for k, v in tally.items()},
        "you": {"id": me.id if me else None, "name": me.name if me else None, "organizer": organizer,
                "vote": me.vote if me else None,
                "profile": json.loads(me.profile_json) if me and me.profile_json else None},
        "updated_at": _iso(g.updated_at),
    }


def group_inputs(code: str, *, trip_token: str | None, member_token: str | None) -> dict:
    """What the consensus agents need: the trip request, trip type, profiles (no names) and need counts."""
    with engine().connect() as c:
        g = _group(c, code)
        if not _organizer(c, g, trip_token, member_token):
            raise Forbidden("Only the organizer can ask the agents for options.")
        trip = c.execute(select(trips).where(trips.c.id == g.trip_id)).first()
        rows = c.execute(select(group_members).where((group_members.c.group_id == g.id) & group_members.c.active)).all()
        needs = c.execute(select(group_needs.c.code).where(group_needs.c.group_id == g.id)).all()
    counts = {}
    for n in needs:
        counts[n.code] = counts.get(n.code, 0) + 1
    return {"group_id": g.id, "trip_type": g.trip_type, "request": json.loads(trip.request_json),
            "profiles": [json.loads(r.profile_json) for r in rows if r.profile_json], "needs": counts}


def set_profile(code: str, member_token: str, profile: dict) -> None:
    with engine().begin() as c:
        g = _group(c, code)
        me = _member(c, g, member_token)
        if not me:
            raise Forbidden("Join the group first.")
        c.execute(update(group_members).where(group_members.c.id == me.id).values(
            profile_json=json.dumps(profile, ensure_ascii=False), updated_at=_now()))
        c.execute(update(groups).where(groups.c.id == g.id).values(updated_at=_now()))


def set_needs(code: str, member_token: str, codes: list[str], show_name: bool) -> int:
    """Replace this member's private needs. Returns how many are stored."""
    with engine().begin() as c:
        g = _group(c, code)
        me = _member(c, g, member_token)
        if not me:
            raise Forbidden("Join the group first.")
        owner = _need_owner(member_token, g.id)
        c.execute(delete(group_needs).where((group_needs.c.group_id == g.id) & (group_needs.c.owner == owner)))
        now = _now()
        for code_ in dict.fromkeys(codes):
            c.execute(insert(group_needs).values(id=uuid.uuid4().hex, group_id=g.id, owner=owner, code=code_,
                                                 display_name=me.name if show_name else None, created_at=now))
        c.execute(update(groups).where(groups.c.id == g.id).values(updated_at=now))
    return len(set(codes))


def save_options(code: str, trip_token: str | None, member_token: str | None, options: dict, run: dict) -> None:
    with engine().begin() as c:
        g = _group(c, code)
        if not _organizer(c, g, trip_token, member_token):
            raise Forbidden("Only the organizer can ask the agents for options.")
        c.execute(update(groups).where(groups.c.id == g.id).values(
            options_json=json.dumps(options, ensure_ascii=False), run_json=json.dumps(run, ensure_ascii=False),
            status="voting", chosen=None, updated_at=_now()))
        c.execute(update(group_members).where(group_members.c.group_id == g.id).values(vote=None))


def group_run(code: str, *, trip_token: str | None = None, member_token: str | None = None) -> dict | None:
    with engine().connect() as c:
        g = _group(c, code)
        if not (_member(c, g, member_token) or _organizer(c, g, trip_token, member_token)):
            raise Forbidden("Join the group first to see it.")
    return json.loads(g.run_json) if g.run_json else None


def cast_vote(code: str, member_token: str, option_id: str | None) -> None:
    with engine().begin() as c:
        g = _group(c, code)
        me = _member(c, g, member_token)
        if not me:
            raise Forbidden("Join the group first.")
        ids = {o["id"] for o in (json.loads(g.options_json)["options"] if g.options_json else [])}
        if option_id is not None and option_id not in ids:
            raise NotFound("No such option.")
        c.execute(update(group_members).where(group_members.c.id == me.id).values(vote=option_id, updated_at=_now()))
        c.execute(update(groups).where(groups.c.id == g.id).values(updated_at=_now()))


def confirm_option(code: str, trip_token: str | None, member_token: str | None, option_id: str, itinerary_for) -> dict:
    """The organizer picks the final plan: the trip's saved request becomes that option's."""
    with engine().begin() as c:
        g = _group(c, code)
        if not _organizer(c, g, trip_token, member_token):
            raise Forbidden("Only the organizer can confirm the final plan.")
        options = json.loads(g.options_json)["options"] if g.options_json else []
        chosen = next((o for o in options if o["id"] == option_id), None)
        if not chosen:
            raise NotFound("No such option.")
        itinerary = itinerary_for(chosen["request"])
        now = _now()
        c.execute(update(trips).where(trips.c.id == g.trip_id).values(
            title=itinerary["title"][:160], request_json=json.dumps(itinerary["request"], ensure_ascii=False),
            itinerary_json=json.dumps(itinerary, ensure_ascii=False), updated_at=now))
        c.execute(update(groups).where(groups.c.id == g.id).values(status="confirmed", chosen=option_id, updated_at=now))
    return {"chosen": option_id, "title": itinerary["title"]}


def group_itinerary(code: str, member_token: str) -> dict:
    with engine().connect() as c:
        g = _group(c, code)
        if not _member(c, g, member_token):
            raise Forbidden("Join the group first.")
        trip = c.execute(select(trips).where(trips.c.id == g.trip_id)).first()
    return {"trip_id": g.trip_id, "title": trip.title, "request": json.loads(trip.request_json),
            "itinerary": json.loads(trip.itinerary_json)}


def leave_group(code: str, member_token: str) -> None:
    with engine().begin() as c:
        g = _group(c, code)
        me = _member(c, g, member_token)
        if not me:
            raise Forbidden("You are not in this group.")
        c.execute(delete(group_needs).where((group_needs.c.group_id == g.id)
                                            & (group_needs.c.owner == _need_owner(member_token, g.id))))
        c.execute(update(group_members).where(group_members.c.id == me.id).values(
            active=False, vote=None, profile_json=None, updated_at=_now()))


def remove_member(code: str, trip_token: str | None, member_token: str | None, member_id: str) -> None:
    """The organizer removes someone. Their private needs can't be traced to them, so they stay
    until the organizer clears all needs (members then add theirs again)."""
    with engine().begin() as c:
        g = _group(c, code)
        if not _organizer(c, g, trip_token, member_token):
            raise Forbidden("Only the organizer can remove someone.")
        c.execute(update(group_members).where((group_members.c.id == member_id) & (group_members.c.group_id == g.id)
                                              & ~group_members.c.is_organizer).values(
            active=False, vote=None, profile_json=None, updated_at=_now()))


def clear_needs(code: str, trip_token: str | None, member_token: str | None) -> None:
    with engine().begin() as c:
        g = _group(c, code)
        if not _organizer(c, g, trip_token, member_token):
            raise Forbidden("Only the organizer can clear the group's needs.")
        c.execute(delete(group_needs).where(group_needs.c.group_id == g.id))


def member_trip_access(trip_id: str, member_token: str) -> bool:
    """A group member may read and add the trip's shared expenses (Safar Saathi across phones)."""
    with engine().connect() as c:
        m = c.execute(select(group_members).where(group_members.c.token_hash == _member_hash(member_token))).first()
        if not m or not m.active:
            return False
        g = c.execute(select(groups).where(groups.c.id == m.group_id)).first()
    return bool(g and g.trip_id == trip_id)
