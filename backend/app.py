"""Raahi API (Flask).

Public, read-only
    GET  /api/health                     what is configured (no secrets)
    GET  /api/destinations[/<id>]        the curated destination guide, with sources
    GET  /api/weather?destination=&start=&days=
    GET  /api/alerts                     official PMD alerts for the region
    GET  /api/roads?destinations=&date=  honest road-status summary
    GET  /api/route?from=&to=
    GET  /api/places?town=&kind=stay|food&min=&max=   stays (curated + OpenStreetMap) and food
Planning
    POST /api/chat                       the agent (tool calling, or guided mode)
    POST /api/plan                       deterministic itinerary from the trip form
    POST /api/plan/update                change a plan, keeping the other preferences
    POST /api/budget                     budget only
    POST /api/conditions                 live forecast + alerts + road summary for a plan
Saved trips (private key in X-Trip-Token)
    POST /api/trips   GET|PUT|DELETE /api/trips/<id>
Booking enquiries (consent required; private key in X-Enquiry-Token)
    GET  /api/enquiries/consent   POST /api/enquiries   GET|DELETE /api/enquiries/<reference>
Admin (Authorization: Bearer ADMIN_TOKEN)
    GET  /api/admin/enquiries   PATCH /api/admin/enquiries/<reference>

Run locally:  pip install -r requirements.txt  &&  python app.py   (http://localhost:5000)
"""
import logging
import os
import re
import time

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from werkzeug.exceptions import HTTPException

import config
import data
import planner
import storage
from agent.runner import run_chat
from schemas import (CONSENT_TEXT, CONSENT_VERSION, ChatRequest, EnquiryAdminUpdate, EnquiryIn, PlanUpdate,
                     TripRequest, TripSave)
from security import admin_status, client_ip, limiter
from services import conditions, http, places, roads, weather

VERSION = "2.0.0"
HEX32 = re.compile(r"^[0-9a-f]{32}$")
REFERENCE = re.compile(r"^RAH-[A-Z0-9]{4}-[A-Z0-9]{4}$")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("raahi.api")


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str = "error", details=None, headers=None):
        super().__init__(message)
        self.status, self.message, self.code, self.details, self.headers = status, message, code, details, headers


class ConditionsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    destinations: list[str] = Field(min_length=1, max_length=8)
    start_date: str | None = Field(default=None, max_length=10)
    days: int | None = Field(default=None, ge=1, le=30)
    plan_days: list[dict] = Field(default_factory=list, max_length=40)


# ── Helpers ───────────────────────────────────────────────────────────────────────
def _errors(exc: ValidationError) -> list[dict]:
    out = []
    for e in exc.errors()[:8]:
        loc = ".".join(str(x) for x in e.get("loc", ()))
        out.append({"field": loc, "message": str(e.get("msg", "invalid")).replace("Value error, ", "")})
    return out


def body() -> dict:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError(400, "Send a JSON object with Content-Type: application/json.", "bad_request")
    return payload


def parse(model, payload):
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        details = _errors(exc)
        first = details[0]["message"] if details else "invalid input"
        raise ApiError(400, f"Some details are not valid: {first}", "validation", details) from exc


def rate(bucket: str, limit: int) -> None:
    ok, retry = limiter.check(bucket, client_ip(), limit)
    if not ok:
        raise ApiError(429, "Too many requests. Please wait a moment and try again.", "rate_limited",
                       headers={"Retry-After": str(retry)})


def need_storage() -> None:
    if not storage.enabled():
        raise ApiError(503, "Saving is not available on this deployment yet (no database is configured).",
                       "storage_unavailable")


def need_admin() -> None:
    status = admin_status()
    if status == "disabled":
        raise ApiError(503, "Admin access is not configured on this server.", "admin_disabled")
    if status != "ok":
        raise ApiError(401, "Admin key missing or wrong.", "unauthorized", headers={"WWW-Authenticate": "Bearer"})


def enquiries_open() -> bool:
    """Enquiries are accepted only when they can be stored AND someone can review them."""
    return storage.enabled() and bool(config.ADMIN_TOKEN)


def trip_token() -> str:
    token = request.headers.get("X-Trip-Token", "")
    if not 16 <= len(token) <= 100:
        raise ApiError(401, "This trip's private key is missing.", "unauthorized")
    return token


def _dest_summary(d: dict) -> dict:
    return {k: d[k] for k in ("id", "name", "region", "category", "tagline", "altitude_m", "best_months",
                              "season_note", "recommended_days", "accessibility", "coords", "sources",
                              "last_reviewed", "record_status")}


# ── App ───────────────────────────────────────────────────────────────────────────
def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_BODY_BYTES
    app.json.sort_keys = False
    CORS(app, resources={r"/api/*": {"origins": config.ALLOWED_ORIGINS}},
         allow_headers=["Content-Type", "Authorization", "X-Trip-Token", "X-Enquiry-Token"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], max_age=600)

    @app.before_request
    def _start():
        g.t0 = time.monotonic()

    @app.after_request
    def _headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if request.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
            resp.headers.setdefault("X-Frame-Options", "DENY")
            ms = int((time.monotonic() - g.get("t0", time.monotonic())) * 1000)
            log.info("%s %s %s %dms", request.method, request.path, resp.status_code, ms)
        return resp

    @app.errorhandler(ApiError)
    def _api_error(e: ApiError):
        resp = jsonify({"error": {"code": e.code, "message": e.message, "details": e.details}})
        resp.status_code = e.status
        for k, v in (e.headers or {}).items():
            resp.headers[k] = v
        return resp

    @app.errorhandler(HTTPException)
    def _http_error(e: HTTPException):
        if not request.path.startswith("/api/") and e.code == 404:
            return _spa(request.path)
        messages = {413: "That request is too large.", 404: "Not found.", 405: "Method not allowed.",
                    400: "Bad request."}
        resp = jsonify({"error": {"code": e.name.lower().replace(" ", "_"),
                                  "message": messages.get(e.code, e.description), "details": None}})
        resp.status_code = e.code
        return resp

    @app.errorhandler(Exception)
    def _crash(e: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.path)
        resp = jsonify({"error": {"code": "server_error", "message": "Something went wrong on our side. Please try "
                                                                     "again.", "details": None}})
        resp.status_code = 500
        return resp

    # ── Read-only ──
    @app.get("/api/health")
    def health():
        return {
            "ok": True, "version": VERSION, "time": http.now_iso(),
            "ai": {"configured": config.llm_enabled(),
                   "providers": [{"name": p["name"], "model": p["models"][0]} for p in config.llm_providers()]},
            "storage": {"enabled": storage.enabled(), "kind": storage.kind()},
            "enquiries_open": enquiries_open(),
            "services": {"weather": config.WEATHER_ENABLED, "pmd_alerts": config.PMD_ALERTS_ENABLED,
                         "routing": config.ROUTING_ENABLED, "places": config.PLACES_ENABLED,
                         "road_news": bool(config.TAVILY_API_KEY),
                         "kkh_model": bool(config.KKH_RISK_API_URL)},
            "data_reviewed": data.dataset()["meta"]["last_reviewed"],
        }

    @app.get("/api/destinations")
    def destinations():
        resp = jsonify({"destinations": [_dest_summary(d) for d in data.dataset()["destinations"]],
                        "meta": data.dataset()["meta"], "general_sources": data.dataset()["general_sources"]})
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp

    @app.get("/api/destinations/<did>")
    def destination(did: str):
        d = data.destination(did)
        if not d:
            raise ApiError(404, "Unknown destination.", "not_found")
        resp = jsonify({"destination": d, "stays": data.stays(did), "meta": data.dataset()["meta"]})
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp

    @app.get("/api/weather")
    def get_weather():
        rate("live", config.LIVE_RATE_PER_MIN)
        did = data.resolve_destination(request.args.get("destination", ""))
        if not did:
            raise ApiError(400, "Choose a destination.", "validation")
        days = request.args.get("days", type=int)
        return weather.forecast(did, request.args.get("start") or None, days)

    @app.get("/api/alerts")
    def get_alerts():
        rate("live", config.LIVE_RATE_PER_MIN)
        return weather.pmd_alerts()

    @app.get("/api/roads")
    def get_roads():
        rate("live", config.LIVE_RATE_PER_MIN)
        ids = [d for d in (data.resolve_destination(x) for x in request.args.get("destinations", "").split(",")) if d]
        return roads.road_status(ids, request.args.get("date") or None)

    @app.get("/api/route")
    def get_route():
        rate("live", config.LIVE_RATE_PER_MIN)
        try:
            return planner.route_summary(request.args.get("from", ""), request.args.get("to", ""))
        except planner.PlanError as exc:
            raise ApiError(400, str(exc), "validation") from exc

    @app.get("/api/places")
    def get_places():
        rate("live", config.LIVE_RATE_PER_MIN)
        town = places.resolve_town(request.args.get("town", ""))
        if not town:
            raise ApiError(400, "Choose a town in the north, for example Hunza, Skardu or Gilgit.", "validation")
        kind = request.args.get("kind", "stay")
        if kind not in ("stay", "food"):
            raise ApiError(400, "kind must be 'stay' or 'food'.", "validation")
        bounds = []
        for name in ("min", "max"):
            raw = request.args.get(name, "").strip()
            value = int(raw) if raw.isdigit() else None
            if raw and (value is None or value > 1_000_000):
                raise ApiError(400, f"{name} must be a whole number of rupees up to 1,000,000.", "validation")
            bounds.append(value)
        return places.stays(town, *bounds) if kind == "stay" else places.food(town)

    # ── Planning ──
    @app.post("/api/chat")
    def chat():
        rate("chat", config.CHAT_RATE_PER_MIN)
        return run_chat(parse(ChatRequest, body()))

    def _build(req: TripRequest) -> dict:
        try:
            return planner.build(req)
        except planner.PlanError as exc:
            raise ApiError(400, str(exc), "validation") from exc

    @app.post("/api/plan")
    def plan():
        rate("plan", config.PLAN_RATE_PER_MIN)
        return {"itinerary": _build(parse(TripRequest, body()))}

    @app.post("/api/plan/update")
    def plan_update():
        rate("plan", config.PLAN_RATE_PER_MIN)
        upd = parse(PlanUpdate, body())
        try:
            req = planner.apply_changes(upd.request, upd.changes)
        except ValidationError as exc:
            raise ApiError(400, "That change is not valid: " + _errors(exc)[0]["message"], "validation") from exc
        except planner.PlanError as exc:
            raise ApiError(400, str(exc), "validation") from exc
        return {"itinerary": _build(req)}

    @app.post("/api/budget")
    def budget():
        rate("plan", config.PLAN_RATE_PER_MIN)
        return {"budget": _build(parse(TripRequest, body()))["budget"]}

    @app.post("/api/conditions")
    def trip_conditions():
        rate("live", config.LIVE_RATE_PER_MIN)
        c = parse(ConditionsIn, body())
        ids = [d for d in (data.resolve_destination(x) for x in c.destinations) if d]
        if not ids:
            raise ApiError(400, "Choose at least one known destination.", "validation")
        return conditions.trip_conditions(ids, c.start_date, c.days, c.plan_days)

    # ── Saved trips ──
    @app.post("/api/trips")
    def trip_create():
        rate("write", config.WRITE_RATE_PER_MIN)
        need_storage()
        save = parse(TripSave, body())
        itinerary = _build(save.request)
        trip, token = storage.create_trip(save.title or itinerary["title"], save.request.model_dump(mode="json"),
                                          itinerary)
        return {"trip": trip, "token": token,
                "note": "Keep this key private: it is the only way to open, change or delete this trip."}, 201

    def _trip_id(trip_id: str) -> str:
        if not HEX32.match(trip_id):
            raise ApiError(404, "Trip not found.", "not_found")
        return trip_id

    @app.get("/api/trips/<trip_id>")
    def trip_get(trip_id: str):
        rate("live", config.LIVE_RATE_PER_MIN)
        need_storage()
        try:
            return {"trip": storage.get_trip(_trip_id(trip_id), trip_token())}
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc

    @app.put("/api/trips/<trip_id>")
    def trip_update(trip_id: str):
        rate("write", config.WRITE_RATE_PER_MIN)
        need_storage()
        save = parse(TripSave, body())
        itinerary = _build(save.request)
        try:
            trip = storage.update_trip(_trip_id(trip_id), trip_token(), save.title or itinerary["title"],
                                       save.request.model_dump(mode="json"), itinerary)
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc
        return {"trip": trip}

    @app.delete("/api/trips/<trip_id>")
    def trip_delete(trip_id: str):
        rate("write", config.WRITE_RATE_PER_MIN)
        need_storage()
        try:
            storage.delete_trip(_trip_id(trip_id), trip_token())
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc
        return "", 204

    # ── Booking enquiries ──
    @app.get("/api/enquiries/consent")
    def enquiry_consent():
        return {"version": CONSENT_VERSION, "text": CONSENT_TEXT, "open": enquiries_open()}

    @app.post("/api/enquiries")
    def enquiry_create():
        rate("write", config.WRITE_RATE_PER_MIN)
        if not enquiries_open():
            raise ApiError(503, "Booking enquiries are not open on this website yet. Nothing was sent.",
                           "enquiries_closed")
        enq = parse(EnquiryIn, body())
        if enq.website:
            raise ApiError(400, "This submission could not be accepted.", "rejected")
        trip_id = None
        if enq.trip:
            try:
                trip_id = storage.get_trip(enq.trip.id, enq.trip.token)["id"]
            except storage.NotFound:
                trip_id = None
        summary, request_json = None, None
        if enq.request and enq.request.destinations:
            plan = _build(enq.request)
            r = plan["request"]
            when = r.get("start_date") or "dates open"
            summary = (f"{plan['title']}: {len(plan['days'])} days from {r['origin']}, {when}, {r['adults']} adult(s)"
                       + (f", {r['children']} child(ren)" if r["children"] else "")
                       + f", estimate PKR {plan['budget']['total']:,}")
            request_json = enq.request.model_dump(mode="json")
        record, token = storage.create_enquiry(
            name=enq.name, contact_method=enq.contact_method, contact_value=enq.contact_value, message=enq.message,
            request=request_json, summary=summary, trip_id=trip_id, consent_text=CONSENT_TEXT,
            consent_version=CONSENT_VERSION)
        method = {"email": "email", "phone": "phone", "whatsapp": "WhatsApp"}[enq.contact_method]
        return {"enquiry": record, "token": token,
                "message": (f"Enquiry {record['reference']} received. This is not a booking: nothing has been "
                            f"reserved or paid. The Raahi team reviews enquiries by hand and will reply by {method}; "
                            "there is no automatic confirmation."),
                "booking_confirmed": False}, 201

    def _ref(reference: str) -> str:
        ref = reference.upper()
        if not REFERENCE.match(ref):
            raise ApiError(404, "Enquiry not found.", "not_found")
        return ref

    @app.get("/api/enquiries/<reference>")
    def enquiry_get(reference: str):
        rate("live", config.LIVE_RATE_PER_MIN)
        need_storage()
        try:
            return {"enquiry": storage.get_enquiry(_ref(reference), request.headers.get("X-Enquiry-Token", ""))}
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc

    @app.delete("/api/enquiries/<reference>")
    def enquiry_withdraw(reference: str):
        rate("write", config.WRITE_RATE_PER_MIN)
        need_storage()
        try:
            storage.withdraw_enquiry(_ref(reference), request.headers.get("X-Enquiry-Token", ""))
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc
        return "", 204

    # ── Admin ──
    @app.get("/api/admin/enquiries")
    def admin_list():
        rate("admin", 60)
        need_admin()
        need_storage()
        status = request.args.get("status") or None
        if status and status not in ("new", "in_review", "contacted", "closed", "spam"):
            raise ApiError(400, "Unknown status filter.", "validation")
        return {"enquiries": storage.list_enquiries(status)}

    @app.patch("/api/admin/enquiries/<reference>")
    def admin_update(reference: str):
        rate("admin", 60)
        need_admin()
        need_storage()
        upd = parse(EnquiryAdminUpdate, body())
        try:
            return {"enquiry": storage.admin_update_enquiry(_ref(reference), upd.status, upd.admin_note)}
        except storage.NotFound as exc:
            raise ApiError(404, str(exc), "not_found") from exc

    # ── Website (Render / local). On Vercel the CDN serves dist/ and only /api reaches Flask. ──
    def _spa(path: str):
        dist = config.DIST_DIR
        if not dist.is_dir():
            return jsonify({"ok": True, "message": "Raahi API is running. Build the website with `npm run build` to "
                                                   "serve it here."}), 200
        clean = path.strip("/")
        if not clean:
            return send_from_directory(dist, "index.html")
        target = (dist / clean).resolve()
        if dist.resolve() in target.parents:
            if target.is_file():
                return send_from_directory(dist, clean)
            if target.with_name(target.name + ".html").is_file():          # /destinations/hunza
                return send_from_directory(dist, clean + ".html")
        shell = "spa.html" if (dist / "spa.html").is_file() else "index.html"
        return send_from_directory(dist, shell)

    @app.get("/")
    @app.get("/<path:path>")
    def website(path: str = ""):
        if path.startswith("api/"):
            raise ApiError(404, "Not found.", "not_found")
        return _spa(path)

    return app


app = create_app()

if __name__ == "__main__":
    # Local development server. Production uses gunicorn (Render) or Vercel's Python runtime.
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")), debug=False)
