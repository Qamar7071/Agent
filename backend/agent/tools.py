"""The agent's tools: the only operations the language model can ask for.

- Every call is validated (pydantic) before it runs; unknown tools and bad arguments come
  back as a clear error the model can recover from.
- Results are plain data that carry their own source and retrieval time.
- Nothing here can book, pay or contact anyone. The enquiry tool only prepares a draft
  form that the traveller must review, consent to and submit themselves.
- Secrets never reach the model: a saved trip's private key goes to the browser through
  `client_actions`, not through the tool result.
"""
import json
import logging
import time
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

import config
import data
import planner
import storage
from schemas import TripRef, TripRequest, TripState, UpdateOp
from services import places, roads, routing, weather

log = logging.getLogger("raahi.tools")


class ToolContext:
    """Per-message working memory: the trip state, results to show in the UI, and a trace."""

    def __init__(self, state: TripState, trip_ref: TripRef | None = None):
        self.state = state
        self.trip_ref = trip_ref
        self.artifacts: dict[str, Any] = {}
        self.client_actions: list[dict] = []
        self.trace: list[dict] = []


# ── Argument models ───────────────────────────────────────────────────────────────
class _Args(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SearchArgs(_Args):
    query: str | None = Field(default=None, max_length=200)
    interests: list[str] = Field(default_factory=list, max_length=8)
    month: int | None = Field(default=None, ge=1, le=12)
    max_altitude_m: int | None = Field(default=None, ge=1000, le=9000)
    avoid_hiking: bool = False


class DestinationArgs(_Args):
    destination: str = Field(max_length=60)


class WeatherArgs(_Args):
    destination: str = Field(max_length=60)
    start_date: date | None = None
    days: int | None = Field(default=None, ge=1, le=16)


class RouteArgs(_Args):
    origin: str = Field(max_length=60)
    destination: str = Field(max_length=60)


class RoadArgs(_Args):
    destinations: list[str] = Field(default_factory=list, max_length=6)
    travel_date: date | None = None


class TripArgs(_Args):
    origin: str | None = Field(default=None, max_length=40)
    destinations: list[str] | None = Field(default=None, max_length=8)
    start_date: date | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    days: int | None = Field(default=None, ge=1, le=30)
    adults: int | None = Field(default=None, ge=1, le=20)
    children: int | None = Field(default=None, ge=0, le=12)
    budget_pkr: int | None = Field(default=None, ge=0, le=20_000_000)
    budget_basis: Literal["total", "per_person"] | None = None
    transport: Literal["car", "bus", "flight"] | None = None
    accommodation: Literal["budget", "mid", "premium"] | None = None
    pace: Literal["relaxed", "balanced", "active"] | None = None
    interests: list[str] | None = Field(default=None, max_length=10)
    accessibility: list[Literal["limited_mobility", "wheelchair", "altitude_sensitive", "elderly", "infant"]] | None = None
    food: str | None = Field(default=None, max_length=120)
    guide: bool | None = None


class ChangeArgs(_Args):
    op: Literal["set", "add_destination", "remove_destination", "edit_day", "reset_day", "regenerate_day"]
    field: str | None = None
    value: Any = None
    destination: str | None = None
    key: str | None = None
    title: str | None = None
    activities: list[str] | None = None
    note: str | None = None


class UpdateArgs(_Args):
    changes: list[ChangeArgs] = Field(min_length=1, max_length=10)


class PlacesArgs(_Args):
    town: str | None = Field(default=None, max_length=60)
    kind: Literal["stay", "food"] = "stay"
    min_pkr_per_night: int | None = Field(default=None, ge=0, le=1_000_000)
    max_pkr_per_night: int | None = Field(default=None, ge=0, le=1_000_000)


class SaveArgs(_Args):
    title: str | None = Field(default=None, max_length=120)


class NoArgs(_Args):
    pass


class EnquiryDraftArgs(_Args):
    message: str | None = Field(default=None, max_length=1000)
    contact_method: Literal["email", "phone", "whatsapp"] | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────────
def _resolve(value: str) -> str:
    did = data.resolve_destination(value)
    if not did:
        names = ", ".join(d["name"] for d in data.dataset()["destinations"])
        raise ToolFailure(f"Unknown destination '{value}'. Raahi covers: {names}.")
    return did


class ToolFailure(Exception):
    pass


def _merge_trip(ctx: ToolContext, args: TripArgs) -> tuple[TripRequest, list[str]]:
    given = args.model_dump(exclude_none=True)
    if "destinations" in given:
        given["destinations"] = [_resolve(d) for d in given["destinations"]]
    if given.get("start_date"):
        given["month"] = given["start_date"].month
    try:
        state = TripState.model_validate({**ctx.state.model_dump(), **given})
    except ValidationError as exc:
        raise ToolFailure(_short_error(exc)) from exc
    if not state.destinations:
        raise ToolFailure("No destination yet. Ask the traveller where they want to go, or use search_destinations.")
    ctx.state = state
    try:
        return state.to_request()
    except ValidationError as exc:
        raise ToolFailure(_short_error(exc)) from exc


def _short_error(exc: ValidationError) -> str:
    parts = []
    for e in exc.errors()[:4]:
        loc = ".".join(str(x) for x in e.get("loc", ()) if x != "__root__")
        msg = str(e.get("msg", "invalid")).replace("Value error, ", "")
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "; ".join(parts)


def _months(ms: list[int]) -> str:
    return ", ".join(planner.MONTHS[m - 1][:3] for m in ms)


def _forecast_view(fc: dict) -> dict:
    if not fc.get("available"):
        return {k: fc.get(k) for k in ("available", "reason", "seasonal_note", "source", "source_url")
                if fc.get(k) is not None}
    return {
        "available": True, "destination": fc["destination"]["name"], "source": fc["source"],
        "retrieved_at": fc["retrieved_at"], "note": fc["note"], "current": fc.get("current"),
        "days": [{k: d[k] for k in ("date", "summary", "max_c", "min_c", "rain_mm", "snow_cm", "rain_chance_pct",
                                    "confidence", "risks")} for d in fc["days"][:16]],
    }


def _alerts_view(alerts: dict) -> dict:
    if not alerts.get("available"):
        return {"available": False, "reason": alerts.get("reason"), "source": alerts.get("source")}
    return {
        "available": True, "source": alerts["source"], "official": True, "retrieved_at": alerts["retrieved_at"],
        "feed_updated": alerts.get("feed_updated"), "active_count": alerts.get("active_count", 0),
        "alerts": [{"title": a.get("title"), "active": a.get("active"), "severity": a.get("severity"),
                    "onset": a.get("onset"), "expires": a.get("expires"), "excerpt": a.get("region_excerpt")}
                   for a in alerts.get("alerts", [])[:4]],
        "note": alerts.get("note"),
    }


# ── Tools ─────────────────────────────────────────────────────────────────────────
def search_destinations(args: SearchArgs, ctx: ToolContext) -> dict:
    words = {w for w in (args.query or "").lower().replace(",", " ").split() if len(w) > 2}
    wanted = set(args.interests) | words
    month = args.month or ctx.state.month
    routes = {r["id"]: r for r in data.seasonal_routes()}
    seasonal_for = {"khunjerab": "khunjerab-pass", "deosai": "deosai-road", "fairy-meadows": "fairy-meadows-track"}
    ranked = []
    for d in data.dataset()["destinations"]:
        if args.max_altitude_m and d["altitude_m"] > args.max_altitude_m:
            continue
        if args.avoid_hiking and d["id"] in ("fairy-meadows", "k2"):
            continue
        text = " ".join([d["name"], d["tagline"], d["description"], " ".join(d["highlights"]),
                         " ".join(d["category"])]).lower()
        reasons, score = [], 0
        hits = [w for w in wanted if w.rstrip("s") in text]
        if hits:
            score += 2 * len(hits)
            reasons.append("matches " + ", ".join(sorted(hits)))
        if month:
            route = routes.get(seasonal_for.get(d["id"], ""))
            if route and month not in route["typical_open_months"]:
                score -= 6
                reasons.append(f"usually closed in {planner.MONTHS[month - 1]}")
            elif month in d["best_months"]:
                score += 2
                reasons.append(f"good in {planner.MONTHS[month - 1]}")
            else:
                score -= 1
                reasons.append(f"outside its usual season in {planner.MONTHS[month - 1]}")
        ranked.append((score, d, reasons))
    ranked.sort(key=lambda x: -x[0])
    return {"ok": True, "results": [{
        "id": d["id"], "name": d["name"], "tagline": d["tagline"], "altitude_m": d["altitude_m"],
        "best_months": _months(d["best_months"]), "recommended_days": d["recommended_days"],
        "accessibility": d["accessibility"], "why": reasons} for _, d, reasons in ranked[:5]],
        "source": "Raahi destination guide (curated, not live)"}


def get_destination_details(args: DestinationArgs, ctx: ToolContext) -> dict:
    d = data.destination(_resolve(args.destination))
    stay = data.stays(d["id"]) or {}
    return {"ok": True, "destination": {
        "id": d["id"], "name": d["name"], "region": d["region"], "description": d["description"],
        "altitude_m": d["altitude_m"], "best_months": _months(d["best_months"]), "season_note": d["season_note"],
        "access": d["access"], "accessibility": d["accessibility"], "highlights": d["highlights"],
        "recommended_days": d["recommended_days"], "visit_costs": d["visit_costs"],
        "bad_weather_alternative": d["bad_weather_alternative"],
        "stays": {"base": stay.get("base"), "note": stay.get("note"), "price_note": stay.get("price_note"),
                  "options": [{"name": o["name"], "tier": o["tier"], "pkr_per_night": f"{o['from']:,}–{o['to']:,}",
                               "status": o["price_status"]} for o in stay.get("options", [])]},
        "sources": d["sources"], "last_reviewed": d["last_reviewed"], "record_note": d["record_note"]}}


def get_weather_forecast(args: WeatherArgs, ctx: ToolContext) -> dict:
    did = _resolve(args.destination)
    start = args.start_date or ctx.state.start_date
    days = args.days or (min(ctx.state.days, 16) if (start and ctx.state.days) else None)
    fc = weather.forecast(did, start.isoformat() if start else None, days)
    alerts = weather.pmd_alerts()
    ctx.artifacts.setdefault("weather", {})[did] = fc
    ctx.artifacts["alerts"] = alerts
    return {"ok": True, "forecast": _forecast_view(fc), "official_alerts": _alerts_view(alerts)}


def get_route_information(args: RouteArgs, ctx: ToolContext) -> dict:
    info = {"ok": True, **planner.route_summary(args.origin, args.destination)}
    ctx.artifacts["route"] = info
    return info


def get_road_status(args: RoadArgs, ctx: ToolContext) -> dict:
    ids = [_resolve(d) for d in args.destinations] or ctx.state.destinations or ["hunza", "skardu"]
    when = args.travel_date or ctx.state.start_date
    status = roads.road_status(ids, when.isoformat() if when else None)
    ctx.artifacts["roads"] = status
    out = dict(status)
    out["official_weather_alerts"] = _alerts_view(status["official_weather_alerts"])
    if status.get("news", {}).get("available"):
        out["news"] = {**status["news"], "items": status["news"]["items"][:5]}
    out["ok"] = True
    return out


def _place_view(p: dict) -> dict:
    keep = ("name", "type", "stars", "cuisine", "distance_km", "phone", "fit", "usual_levels")
    return {k: p[k] for k in keep if p.get(k) not in (None, [], "")}


def find_places(args: PlacesArgs, ctx: ToolContext) -> dict:
    town = places.resolve_town(args.town) if args.town else None
    if args.town and not town:
        raise ToolFailure(f"Raahi has no place listings for '{args.town}'. Try Hunza, Attabad, Passu, Sost, Skardu, "
                          "Fairy Meadows, Gilgit or Chilas.")
    if not town:
        town = places.resolve_town(ctx.state.destinations[0]) if ctx.state.destinations else None
    if not town:
        raise ToolFailure("Which town? For example Hunza, Skardu or Gilgit.")
    if args.kind == "food":
        res = places.food(town)
    else:
        res = places.stays(town, args.min_pkr_per_night, args.max_pkr_per_night)
    ctx.artifacts.setdefault("places", []).append(res)
    out = {k: v for k, v in res.items() if k not in ("live", "curated", "check_prices")}
    if res.get("curated"):
        out["curated_stays"] = [{"name": o["name"], "tier": o["tier"], "pkr_per_night": [o["from"], o["to"]],
                                 "in_range": o.get("in_range")} for o in res["curated"]["options"]]
        out["curated_status"] = "indicative ranges from Raahi's guide, not quotes"
    live = res.get("live") or {}
    if live:
        out["openstreetmap"] = ({"available": True, "retrieved_at": live["retrieved_at"], "count": live["count"],
                                 "places": [_place_view(p) for p in live["places"][:12]],
                                 "status": "real places from OpenStreetMap; no prices"}
                                if live.get("available") else {"available": False, "reason": live.get("reason")})
    out["ok"] = True
    return out


def estimate_trip_budget(args: TripArgs, ctx: ToolContext) -> dict:
    req, assumed = _merge_trip(ctx, args)
    plan = planner.build(req)
    b = plan["budget"]
    ctx.artifacts["budget"] = b
    return {"ok": True, "assumed_defaults": assumed, "currency": "PKR", "status": "estimate, not a quote",
            "total": b["total"], "per_person": b["per_person"], "comparison": b["comparison"],
            "lines": [{"item": l["label"], "amount": l["amount"], "how": l["quantity"], "for": l["basis"]}
                      for l in b["lines"]],
            "savings": b.get("savings", []), "not_included": b["not_included"], "note": b["note"]}


def create_itinerary(args: TripArgs, ctx: ToolContext) -> dict:
    req, assumed = _merge_trip(ctx, args)
    plan = planner.build(req)
    ctx.artifacts["itinerary"] = plan
    ctx.state = ctx.state.absorb(req).model_copy(update={"assumed": assumed})
    return {"ok": True, "assumed_defaults": assumed, "plan": planner.compact(plan),
            "shown_to_traveller": "The full itinerary with times, stays, costs and sources is displayed in the app."}


_SET = TypeAdapter(UpdateOp)
_INT_FIELDS = {"days", "adults", "children", "budget_pkr", "travel_month"}


def _to_op(ch: ChangeArgs):
    raw = ch.model_dump(exclude_none=True)
    if ch.op == "set":
        if not ch.field:
            raise ToolFailure("A 'set' change needs a field.")
        value = ch.value
        if ch.field in _INT_FIELDS and isinstance(value, str):
            digits = value.replace(",", "").strip()
            value = int(float(digits)) if digits.replace(".", "", 1).isdigit() else value
        elif ch.field == "guide" and isinstance(value, str):
            value = value.strip().lower() in ("true", "yes", "1")
        elif ch.field in ("interests", "accessibility") and isinstance(value, str):
            value = [v.strip() for v in value.split(",") if v.strip()]
        elif ch.field == "month":
            raw["field"] = "travel_month"
        raw["value"] = value
    try:
        return _SET.validate_python(raw)
    except ValidationError as exc:
        raise ToolFailure(_short_error(exc)) from exc


def update_itinerary(args: UpdateArgs, ctx: ToolContext) -> dict:
    req = ctx.state.plan()
    if req is None:
        if not ctx.state.destinations:
            raise ToolFailure("There is no trip yet. Create an itinerary first.")
        req, _ = ctx.state.to_request()
    ops = [_to_op(c) for c in args.changes]
    try:
        new_req = planner.apply_changes(req, ops)
    except ValidationError as exc:
        raise ToolFailure(_short_error(exc)) from exc
    plan = planner.build(new_req)
    ctx.artifacts["itinerary"] = plan
    ctx.state = ctx.state.absorb(new_req)
    return {"ok": True, "applied": [c.model_dump(exclude_none=True) for c in args.changes],
            "plan": planner.compact(plan), "kept": "All other preferences were kept."}


def _current_plan(ctx: ToolContext) -> dict | None:
    plan = ctx.artifacts.get("itinerary")
    if plan:
        return plan
    req = ctx.state.plan()
    if req is not None:
        plan = planner.build(req)
        ctx.artifacts["itinerary"] = plan
    return plan


def save_trip(args: SaveArgs, ctx: ToolContext) -> dict:
    if not storage.enabled():
        return {"ok": False, "error": "Saving is not available on this deployment yet (no database is configured). "
                                      "The traveller can still copy or print the plan."}
    plan = _current_plan(ctx)
    if not plan:
        raise ToolFailure("There is no itinerary to save yet. Create one first.")
    title = (args.title or plan["title"])[:120]
    if ctx.trip_ref:
        try:
            trip = storage.update_trip(ctx.trip_ref.id, ctx.trip_ref.token, title, plan["request"], plan)
            ctx.client_actions.append({"type": "trip_saved", "trip_id": trip["id"], "title": title, "updated": True})
            return {"ok": True, "updated": True, "trip_id": trip["id"], "title": title}
        except storage.NotFound:
            pass
    trip, token = storage.create_trip(title, plan["request"], plan)
    ctx.client_actions.append({"type": "trip_saved", "trip_id": trip["id"], "token": token, "title": title})
    return {"ok": True, "saved": True, "trip_id": trip["id"], "title": title,
            "note": "Saved. The private key for this trip was given to the traveller's browser (not to you)."}


def get_saved_trip(args: NoArgs, ctx: ToolContext) -> dict:
    if not ctx.trip_ref:
        return {"ok": False, "error": "No saved trip is open in this browser. The traveller can open one from 'My trips'."}
    trip = storage.get_trip(ctx.trip_ref.id, ctx.trip_ref.token)
    req = TripRequest.model_validate(trip["request"])
    plan = planner.build(req)
    ctx.artifacts["itinerary"] = plan
    ctx.state = ctx.state.absorb(req)
    return {"ok": True, "title": trip["title"], "saved_at": trip["updated_at"], "plan": planner.compact(plan),
            "note": "Rebuilt with today's data, so drive times or estimates may differ slightly from when it was saved."}


def create_booking_enquiry(args: EnquiryDraftArgs, ctx: ToolContext) -> dict:
    plan = _current_plan(ctx)
    summary = None
    if plan:
        r = plan["request"]
        when = r.get("start_date") or (planner.MONTHS[r["travel_month"] - 1] if r.get("travel_month") else "dates open")
        summary = (f"{plan['title']}: {len(plan['days'])} days from {r['origin']}, {when}, {r['adults']} adult(s)"
                   + (f" and {r['children']} child(ren)" if r.get("children") else "")
                   + f", estimated PKR {plan['budget']['total']:,}.")
    draft = {"message": args.message or "I'd like help arranging this trip. Please contact me with options.",
             "contact_method": args.contact_method, "summary": summary}
    ctx.artifacts["enquiry_draft"] = draft
    ctx.client_actions.append({"type": "open_enquiry_form", "draft": draft})
    return {"ok": True, "status": "draft_ready", "sent": False, "storage_available": storage.enabled(),
            "explanation": "A draft enquiry form is now open for the traveller. They must add contact details, tick "
                           "the consent box and press Send. Nothing has been sent, reserved or paid."}


# ── Registry and JSON schemas (kept simple so every provider accepts them) ─────────
_DEST_HELP = "Destination id or name: hunza, skardu, attabad, fairy-meadows, deosai, passu, khunjerab or k2."
_TRIP_PROPS = {
    "origin": {"type": "string", "description": "Starting city: Islamabad, Rawalpindi, Lahore, Karachi, Peshawar, "
                                                "Gilgit or Skardu."},
    "destinations": {"type": "array", "items": {"type": "string"}, "description": _DEST_HELP},
    "start_date": {"type": "string", "description": "First day, YYYY-MM-DD. Only if the traveller gave a date."},
    "month": {"type": "integer", "description": "Travel month 1-12 when only the month is known."},
    "days": {"type": "integer", "description": "Total trip length in days, including travel days."},
    "adults": {"type": "integer"},
    "children": {"type": "integer"},
    "budget_pkr": {"type": "integer", "description": "Budget in PKR."},
    "budget_basis": {"type": "string", "enum": ["total", "per_person"]},
    "transport": {"type": "string", "enum": ["car", "bus", "flight"],
                  "description": "car = hired 4x4 with driver; bus = public coaches; flight = fly to Gilgit/Skardu."},
    "accommodation": {"type": "string", "enum": ["budget", "mid", "premium"]},
    "pace": {"type": "string", "enum": ["relaxed", "balanced", "active"]},
    "interests": {"type": "array", "items": {"type": "string"}},
    "accessibility": {"type": "array", "items": {"type": "string", "enum": [
        "limited_mobility", "wheelchair", "altitude_sensitive", "elderly", "infant"]}},
    "food": {"type": "string", "description": "Dietary preference, e.g. vegetarian."},
    "guide": {"type": "boolean", "description": "Wants a local guide."},
}


def _fn(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": properties, "required": required or []}}}


TOOLS = {
    "search_destinations": (SearchArgs, search_destinations, _fn(
        "search_destinations", "Suggest destinations from Raahi's guide that match interests, a month, an altitude "
        "limit or avoiding hikes. Use when the traveller has not chosen where to go.",
        {"query": {"type": "string"}, "interests": {"type": "array", "items": {"type": "string"}},
         "month": {"type": "integer"}, "max_altitude_m": {"type": "integer"}, "avoid_hiking": {"type": "boolean"}})),
    "get_destination_details": (DestinationArgs, get_destination_details, _fn(
        "get_destination_details", "Facts about one destination: altitude, season, access, accessibility, "
        "highlights, indicative stay prices and sources.", {"destination": {"type": "string", "description": _DEST_HELP}},
        ["destination"])),
    "get_weather_forecast": (WeatherArgs, get_weather_forecast, _fn(
        "get_weather_forecast", "Live model forecast (Open-Meteo, up to 16 days ahead) for a destination, plus "
        "official PMD weather alerts. Use for any weather question.",
        {"destination": {"type": "string", "description": _DEST_HELP},
         "start_date": {"type": "string", "description": "YYYY-MM-DD; omit for the next 7 days."},
         "days": {"type": "integer"}}, ["destination"])),
    "get_route_information": (RouteArgs, get_route_information, _fn(
        "get_route_information", "Road distance and realistic drive time between two places (Raahi's curated "
        "estimate plus an OpenStreetMap routing figure) and a Google Maps link.",
        {"origin": {"type": "string"}, "destination": {"type": "string"}}, ["origin", "destination"])),
    "get_road_status": (RoadArgs, get_road_status, _fn(
        "get_road_status", "What can and cannot be known about road conditions: official PMD alerts, typical "
        "seasonal closures, optional unverified news, and the official places to check. Use for any road question.",
        {"destinations": {"type": "array", "items": {"type": "string"}, "description": _DEST_HELP},
         "travel_date": {"type": "string", "description": "YYYY-MM-DD"}})),
    "estimate_trip_budget": (TripArgs, estimate_trip_budget, _fn(
        "estimate_trip_budget", "Line-by-line cost estimate (PKR) for a trip, compared with the traveller's budget, "
        "with ways to save. Unspecified details use the current trip state.", _TRIP_PROPS)),
    "create_itinerary": (TripArgs, create_itinerary, _fn(
        "create_itinerary", "Build the day-by-day itinerary (route order, travel days, departure times, stays, "
        "costs, risks). Unspecified details use the current trip state; the full plan is shown in the app.",
        _TRIP_PROPS)),
    "update_itinerary": (UpdateArgs, update_itinerary, _fn(
        "update_itinerary", "Change the current itinerary while keeping all other preferences: set a field "
        "(days, dates, budget, pace, transport, stays…), add or remove a destination, or edit/regenerate one day.",
        {"changes": {"type": "array", "items": {"type": "object", "properties": {
            "op": {"type": "string", "enum": ["set", "add_destination", "remove_destination", "edit_day",
                                              "reset_day", "regenerate_day"]},
            "field": {"type": "string", "enum": ["origin", "start_date", "travel_month", "days", "adults",
                                                 "children", "budget_pkr", "budget_basis", "transport",
                                                 "accommodation", "pace", "interests", "accessibility", "food",
                                                 "guide"]},
            "value": {"type": "string", "description": "New value as text, e.g. '5', '2026-11-10', 'budget', "
                                                       "'true', 'photography, lakes'."},
            "destination": {"type": "string"},
            "key": {"type": "string", "description": "Day key from the itinerary, e.g. 'hunza:1'."},
            "title": {"type": "string"}, "activities": {"type": "array", "items": {"type": "string"}},
            "note": {"type": "string"}}, "required": ["op"]}}}, ["changes"])),
    "find_places": (PlacesArgs, find_places, _fn(
        "find_places", "Places to stay or eat in a town on the trip. Stays: Raahi's curated hotels with indicative "
        "price ranges, matched to the traveller's per-night range, plus real places from OpenStreetMap (no prices, "
        "grouped by the price level their type usually has). Food: local dishes and restaurants or cafes from "
        "OpenStreetMap. Use for any hotel, guest house, hostel, restaurant or food question.",
        {"town": {"type": "string", "description": "Hunza, Attabad, Passu, Sost, Skardu, Fairy Meadows, Deosai, "
                                                    "Gilgit or Chilas. Omit to use the trip's first destination."},
         "kind": {"type": "string", "enum": ["stay", "food"]},
         "min_pkr_per_night": {"type": "integer", "description": "Lowest room price per night the traveller wants."},
         "max_pkr_per_night": {"type": "integer", "description": "Highest room price per night the traveller wants."}},
        ["kind"])),
    "save_trip": (SaveArgs, save_trip, _fn(
        "save_trip", "Save the current itinerary so the traveller can reopen it later. Only when they ask to save.",
        {"title": {"type": "string"}})),
    "get_saved_trip": (NoArgs, get_saved_trip, _fn(
        "get_saved_trip", "Load the saved trip that is open in the traveller's browser.", {})),
    "create_booking_enquiry": (EnquiryDraftArgs, create_booking_enquiry, _fn(
        "create_booking_enquiry", "Open a booking-enquiry draft for the traveller to review and send. It does not "
        "send anything, book or pay. Use when they want help booking.",
        {"message": {"type": "string"}, "contact_method": {"type": "string", "enum": ["email", "phone", "whatsapp"]}})),
}
SCHEMAS = [spec[2] for spec in TOOLS.values()]


def execute(name: str, raw_args: Any, ctx: ToolContext) -> dict:
    started = time.monotonic()
    args: dict = {}
    if name not in TOOLS:
        result = {"ok": False, "error": f"Unknown tool '{name}'. Use only the tools provided."}
    else:
        model, fn, _ = TOOLS[name]
        try:
            args = json.loads(raw_args or "{}") if isinstance(raw_args, str) else (raw_args or {})
            if not isinstance(args, dict):
                raise ValueError("arguments must be an object")
            result = fn(model.model_validate(args), ctx)
        except (ValueError, json.JSONDecodeError) as exc:
            if isinstance(exc, ValidationError):
                result = {"ok": False, "error": "Invalid arguments: " + _short_error(exc)}
            else:
                result = {"ok": False, "error": f"Arguments were not valid: {exc}"[:300]}
        except ToolFailure as exc:
            result = {"ok": False, "error": str(exc)}
        except planner.PlanError as exc:
            result = {"ok": False, "error": str(exc)}
        except storage.StorageUnavailable as exc:
            result = {"ok": False, "error": str(exc)}
        except storage.NotFound as exc:
            result = {"ok": False, "error": str(exc)}
        except Exception:  # never let one tool crash the conversation
            log.exception("Tool %s failed", name)
            result = {"ok": False, "error": "This tool failed unexpectedly. Continue without it and say so."}
    ctx.trace.append({"tool": name, "ok": result.get("ok") is not False, "ms": int((time.monotonic() - started) * 1000),
                      "summary": summarize(name, result, args)})
    return result


def summarize(name: str, result: dict, args: dict) -> str:
    """One line for the 'what the agent did' panel."""
    if result.get("ok") is False:
        return f"{name.replace('_', ' ').capitalize()}: {result.get('error', 'failed')}"[:200]
    if name == "get_weather_forecast":
        f = result.get("forecast", {})
        if f.get("available"):
            return f"Weather for {f['destination']}: {len(f['days'])} days from Open-Meteo"
        return f"Weather: {f.get('reason', 'not available')}"
    if name == "get_road_status":
        a = result.get("official_weather_alerts", {})
        n = a.get("active_count", 0) if a.get("available") else "no"
        return f"Road status: not verified (no live official feed); {n} active PMD alerts checked"
    if name in ("create_itinerary", "update_itinerary", "get_saved_trip"):
        p = result.get("plan", {})
        return f"Itinerary: {p.get('title')} — {len(p.get('days', []))} days, about PKR {p.get('budget', {}).get('total', 0):,} (estimate)"
    if name == "estimate_trip_budget":
        return f"Budget estimate: about PKR {result.get('total', 0):,} ({result.get('comparison', {}).get('status')})"
    if name == "get_route_information":
        c = result.get("curated_estimate") or {}
        return f"Route {result.get('from')} → {result.get('to')}: {c.get('km', '?')} km, {c.get('time', '?')} (approx.)"
    if name == "search_destinations":
        return "Suggested: " + ", ".join(r["name"] for r in result.get("results", [])[:3])
    if name == "get_destination_details":
        return f"Details: {result.get('destination', {}).get('name')}"
    if name == "find_places":
        live = result.get("openstreetmap") or {}
        what = "Places to stay" if result.get("kind") == "stay" else "Food"
        found = f"{live.get('count', 0)} on OpenStreetMap" if live.get("available") else "OpenStreetMap unavailable"
        return f"{what} in {result.get('name', '?')}: {found}"
    if name == "save_trip":
        return "Trip saved" if result.get("saved") or result.get("updated") else "Trip not saved"
    if name == "create_booking_enquiry":
        return "Enquiry draft opened for you to review (nothing sent)"
    return name


def to_json(result: dict, limit: int | None = None) -> str:
    """Serialise a tool result for the model, shrinking long lists to stay within budget."""
    limit = limit or config.AGENT_TOOL_RESULT_CHARS
    text = json.dumps(result, ensure_ascii=False, default=str)
    if len(text) <= limit:
        return text
    trimmed = json.loads(text)
    for size in (8, 5, 3, 2):
        _shrink(trimmed, size)
        text = json.dumps(trimmed, ensure_ascii=False)
        if len(text) <= limit:
            return text
    return text[: limit - 40] + ' …"} (truncated)'


def _shrink(obj: Any, size: int) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            _shrink(v, size)
    elif isinstance(obj, list):
        del obj[size:]
        for v in obj:
            _shrink(v, size)
