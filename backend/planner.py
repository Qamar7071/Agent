"""Deterministic trip planner.

Given a validated TripRequest it builds a day-by-day itinerary along Raahi's curated road
network: dates, departure times worked out from daylight, overnight stops, merged short
transfers, day trips, buffer days, stays, per-day costs, risks, bad-weather alternatives
and sources.

It is a pure function with no network calls, so it is fast, testable and cannot invent
live data. Live weather and road information are attached separately
(services/conditions.py), and the agent explains both.
"""
import contextvars
import heapq
import math
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, timedelta
from functools import lru_cache

import budget
import data
from clock import today_pk
from schemas import TripRequest
from services import http, routing

DRIVE_DAY_CAP_H = 12.5          # longest sensible mountain driving day (upper estimate)
MERGE_MOVE_H = 4                # shorter moves happen on the morning of a sightseeing day
FLIGHT_SAME_DAY_TRANSFER_H = 5  # after a morning flight, transfers up to this long the same day
TZ_OFFSET_H = 5                 # Pakistan Standard Time, no daylight saving
SKARDU_SIDE = {"skardu", "deosai", "k2"}
DAYTRIPS = {"deosai": {"bases": ("skardu",), "site_hours": 3},
            "khunjerab": {"bases": ("sost", "passu"), "site_hours": 1}}
ARRIVAL_IS_FIRST_DAY = {"fairy-meadows", "k2"}   # getting there *is* day one (jeep + hike / jeep to Askole)
OVERNIGHT_OK = {"islamabad", "rawalpindi", "lahore", "karachi", "peshawar", "chilas", "gilgit", "skardu", "hunza",
                "attabad", "passu", "sost", "fairy-meadows", "askole"}
HIGH_ALTITUDE_M = 3500
LATEST_START = {"relaxed": 9.5, "balanced": 9.0, "active": 8.0}
ACTIVITIES_PER_DAY = {"relaxed": 2, "balanced": 3, "active": 4}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
K2_PHASES = [(0.0, "Askole → Paiju"), (0.2, "Baltoro Glacier"), (0.5, "Concordia & K2 Base Camp"),
             (0.65, "Return trek")]
TREK_CAMP = "trek-camp"


class PlanError(ValueError):
    """The request cannot be planned at all (e.g. no destination)."""


# ── Road network ──────────────────────────────────────────────────────────────────
# Road legs treated as closed while planning (used by Travel Twin "what if" scenarios).
# A context variable, so parallel simulations in other threads never see each other's closures.
_closed_legs: contextvars.ContextVar[frozenset] = contextvars.ContextVar("raahi_closed_legs", default=frozenset())


def leg_key(a: str, b: str) -> str:
    return "|".join(sorted((a, b)))


@contextmanager
def closures(legs) -> Iterator[None]:
    """Plan as if these road legs (keys from leg_key) were unavailable."""
    token = _closed_legs.set(frozenset(legs or ()))
    try:
        yield
    finally:
        _closed_legs.reset(token)


def reachable(a: str, b: str) -> bool:
    return a == b or path(a, b) is not None


@lru_cache(maxsize=1)
def _graph() -> dict[str, list[tuple[str, dict]]]:
    g: dict[str, list[tuple[str, dict]]] = {}
    for leg in data.dataset()["legs"]:
        if leg.get("mode") == "trek":
            continue
        g.setdefault(leg["from"], []).append((leg["to"], leg))
        g.setdefault(leg["to"], []).append((leg["from"], leg))
    return g


def _hop(a: str, b: str, leg: dict) -> dict:
    return {"from": a, "to": b, "km": leg["km"], "hours": list(leg["hours"]), "mode": leg.get("mode", "drive"),
            "hike_hours": leg.get("hike_hours"), "note": leg["note"]}


def path(a: str, b: str) -> list[dict] | None:
    """Fastest chain of curated legs from a to b (by upper drive-time estimate)."""
    if a == b:
        return []
    g = _graph()
    if a not in g or b not in g:
        rough = routing.curated(a, b)
        if not rough:
            return None
        return [{"from": a, "to": b, "km": rough["km"], "hours": list(rough["hours"]), "mode": "drive",
                 "hike_hours": None, "note": rough["note"], "rough": True}]
    best = {a: 0.0}
    prev: dict[str, tuple[str, dict]] = {}
    heap = [(0.0, a)]
    while heap:
        cost, node = heapq.heappop(heap)
        if node == b:
            break
        if cost > best.get(node, math.inf):
            continue
        closed = _closed_legs.get()
        for nxt, leg in g[node]:
            if closed and leg_key(node, nxt) in closed:
                continue
            c = cost + leg["hours"][1] + (leg.get("hike_hours") or [0, 0])[1] + 0.01
            if c < best.get(nxt, math.inf):
                best[nxt] = c
                prev[nxt] = (node, leg)
                heapq.heappush(heap, (c, nxt))
    if b not in prev:
        return None
    hops, node = [], b
    while node != a:
        src, leg = prev[node]
        hops.append(_hop(src, node, leg))
        node = src
    return hops[::-1]


def _hop_hours(h: dict) -> tuple[float, float]:
    hike = h.get("hike_hours") or [0, 0]
    return h["hours"][0] + hike[0], h["hours"][1] + hike[1]


def _split(hops: list[dict]) -> list[list[dict]]:
    """Group hops into driving days, breaking only at places with beds."""
    days, cur, cur_h = [], [], 0.0
    for h in hops:
        hi = _hop_hours(h)[1]
        if cur and cur_h + hi > DRIVE_DAY_CAP_H and cur[-1]["to"] in OVERNIGHT_OK:
            days.append(cur)
            cur, cur_h = [], 0.0
        cur.append(h)
        cur_h += hi
    if cur:
        days.append(cur)
    return days


def _hours_label(lo: float, hi: float) -> str:
    def f(x):
        if x < 1:
            return f"{int(round(x * 60))} min"
        return f"{x:g}"
    if lo == hi:
        return f"about {f(lo)}" + ("" if lo < 1 else " h")
    if hi < 1:
        return f"{int(round(lo * 60))}–{int(round(hi * 60))} min"
    return f"{f(lo)}–{f(hi)} h"


def _move(hops: list[dict]) -> dict:
    a, b = hops[0]["from"], hops[-1]["to"]
    lo = sum(_hop_hours(h)[0] for h in hops)
    hi = sum(_hop_hours(h)[1] for h in hops)
    km = sum(h["km"] or 0 for h in hops)
    modes = {h["mode"] for h in hops}
    hike = [h for h in hops if h.get("hike_hours")]
    notes = [h["note"] for h in hops]
    if hike:
        notes.append(f"Includes a {hike[0]['hike_hours'][0]}–{hike[0]['hike_hours'][1]} h walk between the jeep "
                     "track and the meadow.")
    rough = any(h.get("rough") for h in hops)
    return {
        "from": a, "to": b, "from_name": data.place_name(a), "to_name": data.place_name(b),
        "mode": "jeep" if "jeep" in modes else "drive", "km": km, "hours": [lo, hi],
        "time_label": _hours_label(lo, hi), "via": [data.place_name(h["to"]) for h in hops[:-1]],
        "legs": [{"from": h["from"], "to": h["to"], "key": leg_key(h["from"], h["to"]),
                  "from_name": data.place_name(h["from"]), "to_name": data.place_name(h["to"]), "km": h["km"],
                  "hours": h["hours"], "mode": h["mode"], "note": h["note"]} for h in hops],
        "notes": notes, "maps_url": routing.maps_link(a, b),
        "status": "rough estimate" if rough else "approximate (curated)", "verified": False,
    }


def _flight(origin_name: str, origin: str, airport: str, outbound: bool = False) -> dict:
    a, b = (airport, origin) if outbound else (origin, airport)
    note = "Weather-dependent: flights to the north are often delayed or cancelled. Check the schedule with the airline."
    if origin_name not in ("Islamabad", "Rawalpindi"):
        note += f" Direct flights from {origin_name} may not run every day; you may need to connect via Islamabad."
    return {"from": a, "to": b, "from_name": data.place_name(a), "to_name": data.place_name(b), "mode": "flight",
            "km": None, "hours": [1, 2], "time_label": "about 1–2 h flight", "via": [], "legs": [],
            "notes": [note], "maps_url": None, "status": "no live schedule", "verified": False}


# ── Daylight ──────────────────────────────────────────────────────────────────────
def sunset_hour(lat: float, lng: float, d: date) -> float:
    """Local (PKT) sunset as decimal hours, NOAA solar equations (accurate to a few minutes)."""
    n = d.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                    - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    phi = math.radians(lat)
    cos_ha = math.cos(math.radians(90.833)) / (math.cos(phi) * math.cos(decl)) - math.tan(phi) * math.tan(decl)
    ha = math.degrees(math.acos(max(-1.0, min(1.0, cos_ha))))
    return (720 - 4 * (lng - ha) - eqt) / 60 + TZ_OFFSET_H


def _clock(h: float) -> str:
    h = h % 24
    return f"{int(h):02d}:{int(round((h - int(h)) * 60)) % 60:02d}"


def _with_breaks(h: float) -> float:
    return h + 0.5 * math.floor(h / 3)                     # about 30 min of stops every 3 hours


def _timing(need_h: float, when: date | None, end_key: str, pace: str) -> dict:
    """Departure time so that a drive of need_h hours (with breaks) ends before dark."""
    need = _with_breaks(need_h)
    latest = LATEST_START[pace]
    where = data.coords(end_key)
    if when and where:
        sunset = sunset_hour(where[0], where[1], when)
        depart = math.floor((sunset - 0.75 - need) * 2) / 2
        depart = min(depart, latest)
        after_dark = False
        if depart < 5.0:
            depart = 5.0
            after_dark = depart + need > sunset - 0.25
        return {"depart": _clock(depart), "arrive_around": _clock(depart + need), "sunset": _clock(sunset),
                "basis": "Timed to arrive about 45 minutes before sunset, worked out for this date and place.",
                "after_dark_risk": after_dark, "_start": depart}
    depart = 5.5 if need >= 9 else 7.0 if need >= 5 else latest
    return {"depart": _clock(depart), "arrive_around": _clock(depart + need), "sunset": None,
            "basis": "General guidance. Add travel dates for a daylight-based time.", "after_dark_risk": need > 11,
            "_start": depart}


def _latest_departure(need_h: float, when: date | None, end_key: str) -> dict:
    """For an afternoon drive: the latest time to leave and still arrive in daylight."""
    need = _with_breaks(need_h)
    where = data.coords(end_key)
    if when and where:
        sunset = sunset_hour(where[0], where[1], when)
        leave = math.floor((sunset - 0.75 - need) * 2) / 2
        return {"depart": f"by {_clock(leave)}", "arrive_around": _clock(leave + need), "sunset": _clock(sunset),
                "basis": "Latest departure that still arrives about 45 minutes before sunset.", "after_dark_risk": False}
    return {"depart": "early afternoon", "arrive_around": None, "sunset": None,
            "basis": "General guidance. Add travel dates for a daylight-based time.", "after_dark_risk": False}


# ── Assembly ──────────────────────────────────────────────────────────────────────
def _day(kind: str, key: str, title: str, activities: list[str], dest: str | None = None,
         moves: list[dict] | None = None, overnight: str | None = None, template: dict | None = None) -> dict:
    return {"type": kind, "key": key, "title": title, "activities": list(activities), "destination_id": dest,
            "moves": moves or [], "overnight": overnight, "notes": [], "risks": [], "template": template}


def _base_for(did: str, current: str) -> str:
    trip = DAYTRIPS.get(did)
    if trip and current in trip["bases"]:
        return current
    return data.destination(did)["sleep_hub"]


def _assemble(req: TripRequest, selected: list[str], alloc: dict[str, int], buffers: int) -> list[dict]:
    origin_name = req.origin
    origin = data.origin_key(origin_name)
    lowland = origin_name in data.LOWLAND_ORIGINS
    by_air = req.transport == "flight" and lowland
    home = "islamabad" if (origin == "rawalpindi" or (origin == "karachi" and not by_air)) else origin
    days: list[dict] = []
    cur = home

    if by_air:
        airport = "skardu" if selected[0] in SKARDU_SIDE else "gilgit"
        flight = _flight(origin_name, origin, airport)
        day = _day("travel", f"flight:{origin}>{airport}", f"Fly {origin_name} → {data.place_name(airport)}",
                   ["Morning flight north (weather-dependent)"], selected[0], [flight], airport)
        cur = airport
        base = _base_for(selected[0], airport)
        hops = path(airport, base) if base != airport else []
        if hops and selected[0] not in ARRIVAL_IS_FIRST_DAY:
            mv = _move(hops)
            if mv["hours"][1] <= FLIGHT_SAME_DAY_TRANSFER_H:
                day["moves"].append(mv)
                day["activities"].append(f"Drive to {mv['to_name']} ({mv['time_label']})")
                day["overnight"] = cur = base
                day["key"] = f"flight:{origin}>{base}"
        day["activities"].append("Rest and acclimatise; short evening walk")
        days.append(day)

    for did in selected:
        dest = data.destination(did)
        base = _base_for(did, cur)
        first_move = None
        if cur != base:
            hops = path(cur, base) or []
            groups = _split(hops) if hops else []
            total_hi = sum(_hop_hours(h)[1] for h in hops)
            if did in ARRIVAL_IS_FIRST_DAY:
                tail = groups.pop() if groups else []
                for grp in groups:
                    days.append(_travel_day(grp))
                first_move = _move(tail) if tail else None
            elif total_hi > MERGE_MOVE_H or (lowland and cur == home and not by_air):
                for grp in groups:
                    days.append(_travel_day(grp, arriving_at=did))
            elif hops:
                mv = _move(hops)
                trip = DAYTRIPS.get(did)
                out_hops = path(base, did) if trip else None
                if out_hops and mv["hours"][1] + 2 * sum(_hop_hours(h)[1] for h in out_hops) + trip["site_hours"] > 8:
                    days.append(_travel_day(hops, arriving_at=did))
                else:
                    first_move = mv
            cur = base
        days.extend(_destination_days(req, did, dest, alloc[did], cur, first_move))
        if did == "k2":
            cur = "skardu"

    # Buffers (weather/closure days) and free days sit before the journey home.
    ap = "skardu" if cur in ("skardu", "askole") else "gilgit"
    for i in range(buffers):
        day = _day("buffer", f"buffer:{i + 1}", "Buffer day",
                   ["Kept free for weather, flight delays or a road closure",
                    "If all goes well: a slow morning, local markets or a favourite viewpoint"], None, [], cur)
        if by_air and i == 0 and cur != ap:
            hops = path(cur, ap)
            if hops:
                mv = _move(hops)
                day["moves"] = [mv]
                day["title"] = f"Transfer to {data.place_name(ap)} + buffer"
                day["activities"] = [f"Drive to {mv['to_name']} ({mv['time_label']}), close to the airport",
                                     "Spare time in case the flight is delayed"]
                day["overnight"] = cur = ap
        days.append(day)

    if by_air:
        moves, acts = [], []
        if cur != ap:
            hops = path(cur, ap)
            mv = _move(hops) if hops else None
            if mv and mv["hours"][1] > 3:
                days.append(_travel_day(_split(hops)[0]))
            elif mv:
                moves.append(mv)
                acts.append(f"Very early drive to {mv['to_name']} airport ({mv['time_label']})")
            cur = ap
        moves.append(_flight(origin_name, origin, ap, outbound=True))
        acts.append(f"Flight {data.place_name(ap)} → {origin_name} (weather-dependent)")
        days.append(_day("travel", f"flight:{ap}>{origin}", f"Fly home to {origin_name}", acts, None, moves, None))
    elif cur != home:
        hops = path(cur, home) or []
        total_hi = sum(_hop_hours(h)[1] for h in hops)
        if not lowland and total_hi <= MERGE_MOVE_H and days:
            last = days[-1]
            mv = _move(hops)
            mv["afternoon"] = True
            last["moves"].append(mv)
            last["activities"].append(f"Afternoon: drive back to {mv['to_name']} ({mv['time_label']})")
        else:
            for grp in _split(hops):
                days.append(_travel_day(grp, homeward=True))

    if days:
        days[-1]["overnight"] = None
    return days


def _travel_day(hops: list[dict], arriving_at: str | None = None, homeward: bool = False) -> dict:
    mv = _move(hops)
    acts = ["Early start", f"Drive {mv['from_name']} → {mv['to_name']} ({mv['time_label']})"]
    if mv["via"]:
        acts.append("Via " + ", ".join(mv["via"]))
    acts.append("Rest on arrival" if not homeward else "Home")
    title = f"{mv['from_name']} → {mv['to_name']}"
    return _day("travel", f"travel:{mv['from']}>{mv['to']}", title, acts, arriving_at, [mv], mv["to"])


def _destination_days(req: TripRequest, did: str, dest: dict, n: int, base: str, first_move: dict | None) -> list[dict]:
    plans = dest["day_plans"]
    out = []
    if did == "k2":
        for i in range(n):
            if i == 0:
                tpl = plans[0]
            elif i == n - 1:
                tpl = {"title": "Askole → Skardu", "activities": ["Jeep back through the Braldu gorge", "Hot shower in Skardu"]}
            else:
                frac = (i - 1) / max(1, n - 2)
                phase = [p for p in K2_PHASES if frac >= p[0]][-1][1]
                prev_frac = (i - 2) / max(1, n - 2)
                cont = i > 1 and [p for p in K2_PHASES if prev_frac >= p[0]][-1][1] == phase
                tpl = next((p for p in plans if p["title"] == phase), {"title": phase, "activities": []})
                tpl = {"title": f"Trek day {i}: {tpl['title']}" + (" (continued)" if cont else ""),
                       "activities": tpl["activities"]
                       + ["Stages, camps and rest days follow your licensed operator's schedule"]}
            kind = "trek" if 0 < i < n - 1 else "travel"
            moves = [first_move] if (i == 0 and first_move) else []
            overnight = ("askole" if i == 0 else TREK_CAMP) if i < n - 1 else "skardu"
            if i == n - 1:
                back = path("askole", "skardu")
                moves = [_move(back)] if back else []
            day = _day(kind, f"k2:{i}", tpl["title"], tpl["activities"], did, moves, overnight, tpl)
            out.append(day)
        return out

    trip = DAYTRIPS.get(did)
    for i in range(n):
        variant = req.day_edits.get(f"{did}:{i}").variant if f"{did}:{i}" in req.day_edits else 0
        tpl = _template(dest, i, variant, req)
        moves = []
        if i == 0 and first_move:
            moves.append(first_move)
        if trip:
            out_hops = path(base, did) or []
            if out_hops:
                go = _move(out_hops)
                go["round_trip"] = True
                go["site_hours"] = trip["site_hours"]
                moves.append(go)
            acts = [f"Early start from {data.place_name(base)}" if a.startswith("Early start from") else a
                    for a in tpl["activities"]]
            day = _day("daytrip", f"{did}:{i}", tpl["title"], acts, did, moves, base, tpl)
        else:
            kind = "stay"
            day = _day(kind, f"{did}:{i}", tpl["title"], tpl["activities"], did, moves, base, tpl)
        out.append(day)
    return out


def _template(dest: dict, i: int, variant: int, req: TripRequest) -> dict:
    plans = dest["day_plans"]
    slots = len(plans) + 1                      # the extra slot is a free day
    idx = (i + variant) % slots if (i < len(plans) or variant) else len(plans)
    if dest["id"] in ARRIVAL_IS_FIRST_DAY and i > 0 and idx == 0:
        idx = 1 % slots                         # the arrival template only fits the arrival day
    if idx < len(plans):
        return plans[idx]
    nearby = [n for n in dest.get("nearby", []) if n not in req.destinations and data.destination(n)]
    acts = ["Explore at your own pace", "Revisit a favourite viewpoint at golden hour"]
    if nearby:
        acts.append(f"Optional: half-day trip towards {data.place_name(nearby[0])}")
    acts.append("Rest: useful for acclimatisation and as a weather buffer")
    return {"title": f"{dest['name']}: free day", "activities": acts}


# ── Allocation ────────────────────────────────────────────────────────────────────
def _matches(did: str, interests: list[str]) -> bool:
    d = data.destination(did)
    words = set(d["category"]) | {w.lower() for h in d["highlights"] for w in h.split()}
    keyword = {"lakes": "lakes", "trekking": "treks", "mountains": "high", "culture": "culture", "photography": "valleys"}
    return any(keyword.get(i, i) in words for i in interests)


def _allocate(req: TripRequest, selected: list[str]) -> tuple[dict, int, dict]:
    ds = data.destinations()
    rec = {d: ds[d]["recommended_days"] for d in selected}
    alloc = {d: (max(14, rec[d]["default"]) if d == "k2" else rec[d]["default"]) for d in selected}
    soft = {d: rec[d]["min"] for d in selected}
    hard = {d: (14 if d == "k2" else 1) for d in selected}
    lowland = req.origin in data.LOWLAND_ORIGINS
    want_buffer = (req.transport == "flight" and lowland) or req.days >= 9
    # Travel days do not depend on how long you stay; a buffer day can absorb a transfer.
    fixed0 = len(_assemble(req, selected, alloc, 0)) - sum(alloc.values())
    fixed1 = len(_assemble(req, selected, alloc, 1)) - sum(alloc.values()) - 1

    for floor in (soft, hard):
        while fixed0 + sum(alloc.values()) > req.days:
            cands = [d for d in selected if alloc[d] > floor[d]]
            if not cands:
                break
            trim = max(cands, key=lambda d: (alloc[d] - floor[d], selected.index(d)))
            alloc[trim] -= 1

    needed = fixed0 + sum(alloc.values())
    feasible = needed <= req.days
    buffers, fixed = 0, fixed0
    if want_buffer and req.days - fixed1 - sum(alloc.values()) >= 1:
        buffers, fixed = 1, fixed1
    spare = max(0, req.days - fixed - sum(alloc.values()) - buffers)
    order = sorted(selected, key=lambda d: (0 if _matches(d, req.interests) else 1, selected.index(d)))
    while spare:
        grew = False
        for d in order:
            if spare and alloc[d] < rec[d]["max"]:
                alloc[d] += 1
                spare -= 1
                grew = True
        if not grew:
            break
    feas = {"ok": feasible, "requested_days": req.days, "travel_days": fixed0,
            "minimum_days": fixed0 + sum(hard.values()), "planned_days": max(req.days, needed),
            "spare_days": spare, "allocation": dict(alloc),
            "recommended": {d: rec[d]["min"] for d in selected}}
    return alloc, buffers + spare, feas


# ── Public API ────────────────────────────────────────────────────────────────────
def build(req: TripRequest, *, with_savings: bool = True) -> dict:
    selected = [d for d in data.route_order() if d in req.destinations]
    if not selected:
        raise PlanError("Choose at least one destination.")
    alloc, buffers, feas = _allocate(req, selected)
    days = _assemble(req, selected, alloc, buffers)
    warnings: list[dict] = []
    _finish_days(req, days, warnings)
    _check_feasibility(req, selected, feas, warnings)
    _check_season(req, days, warnings)
    _check_people(req, selected, warnings)
    _check_origin(req, warnings)
    if req.transport == "flight" and req.origin in data.LOWLAND_ORIGINS and not any(d["type"] == "buffer" for d in days):
        warnings.append(_w("warning", "no_buffer", "Flights to the north are often cancelled by weather and this plan "
                                                   "has no spare day. Add a day if you can."))

    cost = budget.estimate(req, days)
    if req.origin not in ("Islamabad", "Rawalpindi") and req.transport == "flight":
        cost["assumptions"].insert(1, f"Fares from {req.origin} can be higher than from Islamabad or need a connection.")
    if with_savings and cost["comparison"]["status"] in ("over", "tight"):
        cost["savings"] = _savings(req, cost["total"])
        tip = "; ".join(f"{s['label'].lower()} (saves about PKR {s['saves_pkr']:,})" for s in cost["savings"][:3])
        warnings.append(_w("warning" if cost["comparison"]["status"] == "tight" else "danger", "budget",
                           cost["comparison"]["message"] + (f" Options: {tip}." if tip else "")))

    names = [data.destination(d)["name"] for d in selected]
    title = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    travel = sum(1 for d in days if d["type"] == "travel")
    summary = (f"{len(days)} days from {req.origin}: {travel} mainly travel day{'s' if travel != 1 else ''} and "
               f"{len(days) - travel} days to explore. Drive times are approximate and prices are estimates.")
    return {
        "version": 2,
        "title": title,
        "summary": summary,
        "request": req.model_dump(mode="json"),
        "feasibility": feas,
        "days": days,
        "stays": _stays(req, days),
        "budget": cost,
        "warnings": _dedupe(warnings),
        "sources": _sources(selected),
        "data_reviewed": data.dataset()["meta"]["last_reviewed"],
        "generated_at": http.now_iso(),
        "honesty": "Built from Raahi's curated route and price data (approximate, reviewed "
                   f"{data.dataset()['meta']['last_reviewed']}). Live weather and road checks are separate: "
                   "see Conditions. Nothing has been booked.",
    }


def _finish_days(req: TripRequest, days: list[dict], warnings: list[dict]) -> None:
    per_day = ACTIVITIES_PER_DAY[req.pace]
    for n, day in enumerate(days, start=1):
        day["day"] = n
        when = req.start_date + timedelta(days=n - 1) if req.start_date else None
        day["date"] = when.isoformat() if when else None
        day["weekday"] = when.strftime("%a") if when else None
        sun_day = when
        if not when and req.travel_month:      # month known: time the drives for mid-month daylight
            today = today_pk()
            year = today.year if req.travel_month >= today.month else today.year + 1
            sun_day = date(year, req.travel_month, 15)
        dest = data.destination(day["destination_id"]) if day.get("destination_id") else None

        _time_moves(day, sun_day, req.pace)
        if sun_day and not when:
            for mv in day["moves"]:
                t = mv.get("timing") or {}
                if t.get("sunset"):
                    t["basis"] = (f"Timed for mid-{MONTHS[req.travel_month - 1]} daylight; exact dates give exact "
                                  "times.")

        # Activities: pace decides how full the day is; a morning transfer takes one slot.
        acts = list(day["activities"])
        day["activities_auto"] = False
        if day["type"] == "travel" and day["moves"] and not day.get("template"):
            acts = _travel_activities(day)
            day["activities_auto"] = True
        if day["type"] in ("stay", "daytrip"):
            if day["type"] == "stay":
                limit = per_day - (1 if any(not m.get("round_trip") and not m.get("afternoon") for m in day["moves"]) else 0)
                acts = acts[:max(1, limit)]
            if req.pace == "active" and dest and len(acts) < per_day:
                extra = [h for h in dest["highlights"] if all(h.split()[0] not in a for a in acts)]
                acts += extra[: per_day - len(acts)]
            morning = [m for m in day["moves"] if not m.get("round_trip") and not m.get("afternoon")]
            if morning:
                m = morning[0]
                acts.insert(0, f"Morning: {m['from_name']} → {m['to_name']} ({m['time_label']})")
        day["activities"] = acts

        edit = req.day_edits.get(day["key"])
        day["edited"] = False
        day["user_note"] = None
        if edit and (edit.title or edit.activities or edit.note):
            day["title"] = edit.title or day["title"]
            day["activities"] = list(edit.activities) if edit.activities else day["activities"]
            day["user_note"] = edit.note
            day["edited"] = True
            day["activities_auto"] = day["activities_auto"] and not edit.activities

        day["overnight"] = ({"hub": day["overnight"], "name": data.place_name(day["overnight"])}
                            if day["overnight"] else None)
        day["risks"] = _risks(day, dest, req)
        day["weather_alternative"] = _alternative(day, dest)
        day["sources"] = _day_sources(day, dest)
        day.pop("template", None)


def _need(mv: dict) -> float:
    return mv["hours"][1] * (2 if mv.get("round_trip") else 1) + mv.get("site_hours", 0)


def _time_moves(day: dict, when: date | None, pace: str) -> None:
    """Departure times for the day's legs, in sequence, so the whole day ends in daylight."""
    seq = []
    for mv in day["moves"]:
        if mv["mode"] == "flight":
            mv["timing"] = {"depart": None, "basis": "Flight times come from the airline; morning departures are usual.",
                            "after_dark_risk": False}
        elif mv.get("afternoon"):
            mv["timing"] = _latest_departure(_need(mv), when, mv["to"])
        else:
            seq.append(mv)
    if not seq:
        return
    last = seq[-1]
    end = last["from"] if last.get("round_trip") else last["to"]
    first = _timing(sum(_need(m) for m in seq), when, end, pace)
    start = first.pop("_start")
    for i, mv in enumerate(seq):
        need = _with_breaks(_need(mv))
        if i == 0:
            mv["timing"] = {**first, "arrive_around": _clock(start + need)}
        else:
            mv["timing"] = {"depart": _clock(start), "arrive_around": _clock(start + need), "sunset": first["sunset"],
                            "basis": "Continues straight after the previous leg.",
                            "after_dark_risk": first["after_dark_risk"]}
        if mv.get("round_trip"):
            mv["timing"]["basis"] = f"Out and back with about {mv['site_hours']} h there. " + mv["timing"]["basis"]
            mv["timing"]["arrive_around"] = None
            mv["timing"]["back_around"] = _clock(start + need)
        start += need


def _travel_activities(day: dict) -> list[str]:
    acts = []
    for mv in day["moves"]:
        t = mv.get("timing") or {}
        if mv["mode"] == "flight":
            acts.append(f"Flight {mv['from_name']} → {mv['to_name']} (weather-dependent; check the airline's time)")
            continue
        lead = f"Leave {mv['from_name']} around {t['depart']}" if t.get("depart") else f"Leave {mv['from_name']}"
        acts.append(f"{lead}: {mv['time_label']} by {'jeep' if mv['mode'] == 'jeep' else 'road'} to {mv['to_name']}"
                    + (f" via {', '.join(mv['via'])}" if mv["via"] else ""))
        if any(h.get("note", "").startswith("Narrow jeep track") for h in mv["legs"]) or mv["mode"] == "jeep":
            acts.append("Last stretch by local jeep" + (" and on foot" if any("walk" in n for n in mv["notes"]) else ""))
        if t.get("arrive_around"):
            acts.append(f"Arrive around {t['arrive_around']}" + ("; rest" if day["overnight"] else ""))
    if day["overnight"] and any(m["mode"] == "flight" for m in day["moves"]):
        acts.append("Rest and acclimatise; short evening walk")
    if not day["overnight"]:
        acts.append("Trip ends")
    return acts


def _risks(day: dict, dest: dict | None, req: TripRequest) -> list[str]:
    out = []
    if dest and dest["id"] == "k2" and day["type"] == "trek":
        out.append(f"High-altitude glacier trek (up to about {dest['altitude_m']:,} m at K2 Base Camp): follow your "
                   "operator's acclimatisation plan and turn back if symptoms of altitude sickness appear.")
    elif dest and day["type"] in ("stay", "daytrip") and dest["altitude_m"] >= HIGH_ALTITUDE_M:
        out.append(f"High altitude (about {dest['altitude_m']:,} m): go slowly, drink water and turn back if you get a "
                   "headache, dizziness or breathlessness.")
    for mv in day["moves"]:
        if mv["mode"] == "flight":
            out.append("Flights north are weather-dependent and often delayed or cancelled.")
            continue
        hi = mv["hours"][1] * (2 if mv.get("round_trip") else 1)
        if hi >= 8:
            out.append(f"Long mountain drive (up to about {hi:g} h on the road): start early, take breaks and do "
                       "not drive after dark.")
        if mv["timing"].get("after_dark_risk"):
            out.append("You may arrive after dark: consider breaking this journey into two days.")
        if mv["mode"] == "jeep":
            out.append("Narrow jeep track: use a local registered driver and avoid it in heavy rain.")
        if day["type"] == "travel" and mv["mode"] == "drive":
            out.append("Road status is not live in this plan: check NHMP (130) on the morning you travel.")
    return list(dict.fromkeys(out))


def _alternative(day: dict, dest: dict | None) -> str | None:
    if day["type"] in ("stay", "daytrip", "trek") and dest:
        return dest.get("bad_weather_alternative")
    if day["type"] == "travel" and any(m["mode"] == "drive" for m in day["moves"]):
        start = day["moves"][0]["from_name"]
        return (f"If heavy rain, snow or a closure is reported, wait in {start} instead of driving: landslides are "
                "common after heavy rain.")
    if day["type"] == "travel" and any(m["mode"] == "flight" for m in day["moves"]):
        return "If the flight is cancelled, use the buffer day, or travel by road (two long days via Chilas)."
    return None


def _day_sources(day: dict, dest: dict | None) -> list[dict]:
    out = list(dest["sources"][:2]) if dest else []
    if any(m["mode"] != "flight" for m in day["moves"]):
        out.append({"label": "Raahi curated route estimate (approximate, not live)", "url": None})
    return out


def _w(level: str, code: str, message: str) -> dict:
    return {"level": level, "code": code, "message": message}


def _dedupe(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for w in items:
        k = (w["code"], w["message"])
        if k not in seen:
            seen.add(k)
            out.append(w)
    order = {"danger": 0, "warning": 1, "info": 2}
    return sorted(out, key=lambda w: order[w["level"]])


def _check_feasibility(req: TripRequest, selected: list[str], feas: dict, warnings: list[dict]) -> None:
    if not feas["ok"]:
        msg = (f"{req.days} days is not enough for this route: travel alone takes about {feas['travel_days']} days, so "
               f"this plan needs at least {feas['planned_days']} days. You could choose fewer places")
        lowland = req.origin in data.LOWLAND_ORIGINS
        if req.transport != "flight" and lowland:
            fly = _allocate(req.model_copy(update={"transport": "flight"}), selected)[2]
            if fly["minimum_days"] < feas["minimum_days"]:
                msg += f", fly to Gilgit/Skardu (from about {fly['minimum_days']} days)"
        msg += " or add days. The days shown below are the shortest workable version."
        warnings.append(_w("danger", "too_short", msg))
    else:
        for did in selected:
            got, want = feas["allocation"][did], feas["recommended"][did]
            if got < want and did != "k2":
                warnings.append(_w("warning", f"rushed_{did}",
                                   f"Only {got} day{'s' if got != 1 else ''} at {data.place_name(did)}; "
                                   f"{want} or more is recommended."))
        if feas["spare_days"]:
            warnings.append(_w("info", "spare_days",
                               f"This route needs fewer days than you have; {feas['spare_days']} free day(s) were "
                               "added. You could add a nearby destination instead."))
    if "k2" in selected:
        warnings.append(_w("warning", "k2_operator",
                           "K2 Base Camp is a multi-week glacier trek that needs a permit and a licensed operator. "
                           "The trek days here are an outline; your operator sets the real stages."))


def _check_season(req: TripRequest, days: list[dict], warnings: list[dict]) -> None:
    if not req.start_date and not req.travel_month:
        warnings.append(_w("info", "no_dates", "Add travel dates to check seasonal access, get departure times "
                                               "based on daylight, and see the weather forecast."))
        return
    if req.start_date:
        today = today_pk()
        if req.start_date < today:
            warnings.append(_w("danger", "past_dates", "The start date is in the past. Choose new dates."))
            return
        if (req.start_date - today).days <= 15:
            warnings.append(_w("info", "forecast_available", "Your dates are within the forecast range: check the "
                                                              "weather and road panel before you go."))
        else:
            warnings.append(_w("info", "forecast_later", "Forecasts only reach about 16 days ahead, so this plan uses "
                                                          "seasonal patterns for now. Check again closer to your trip."))
    else:
        warnings.append(_w("info", "month_only", f"Planned for {MONTHS[req.travel_month - 1]} without exact dates: "
                                                 "add dates for daylight-based departure times and forecasts."))

    def month_of(day: dict) -> int:
        return date.fromisoformat(day["date"]).month if day["date"] else req.travel_month

    seen = set()
    routes = {r["id"]: r for r in data.seasonal_routes()}
    seasonal_for = {"khunjerab": "khunjerab-pass", "deosai": "deosai-road", "fairy-meadows": "fairy-meadows-track"}
    for day in days:
        did = day.get("destination_id")
        if not did or did in seen or day["type"] not in ("stay", "daytrip", "trek", "travel"):
            continue
        if day["type"] == "travel" and did not in ARRIVAL_IS_FIRST_DAY:
            continue
        seen.add(did)
        dest = data.destination(did)
        month = month_of(day)
        route = routes.get(seasonal_for.get(did, ""))
        if route and month not in route["typical_open_months"]:
            warnings.append(_w("danger", f"season_{did}",
                               f"Usually closed in {MONTHS[month - 1]}: {route['name']} (typically open "
                               f"{_months(route['typical_open_months'])}). This part of the plan may not be possible. "
                               f"{route['note']}"))
            day["risks"].insert(0, f"Usually closed in {MONTHS[month - 1]}: confirm locally before going.")
        elif month not in dest["best_months"]:
            warnings.append(_w("warning", f"season_{did}",
                               f"{dest['name']} in {MONTHS[month - 1]} is outside its usual season "
                               f"({_months(dest['best_months'])}). Region-wide in {MONTHS[month - 1]}: {data.season_note(month)}"))
    months = {month_of(d) for d in days}
    if months & {12, 1, 2}:
        warnings.append(_w("warning", "winter", "Winter trip: flights are often cancelled and the KKH can close after "
                                                "snowfall. Keep spare days and pack for sub-zero nights."))
    if months & {7, 8}:
        warnings.append(_w("warning", "monsoon", "Monsoon months: heavy rain can trigger landslides on the KKH and "
                                                 "the Skardu road. Keep a spare day and check road status daily."))


def _months(ms: list[int]) -> str:
    return f"{MONTHS[ms[0] - 1]}–{MONTHS[ms[-1] - 1]}" if ms else "—"


def _check_people(req: TripRequest, selected: list[str], warnings: list[dict]) -> None:
    needs = set(req.accessibility)
    mobility = needs & {"limited_mobility", "wheelchair"}
    altitude = needs & {"altitude_sensitive", "elderly", "infant"} or req.children > 0
    for did in selected:
        d = data.destination(did)
        if mobility and did in ("fairy-meadows", "k2"):
            warnings.append(_w("danger", f"access_{did}", f"{d['name']}: {d['accessibility']} Consider removing it."))
        elif mobility and did in ("passu", "deosai", "hunza"):
            warnings.append(_w("warning", f"access_{did}", f"{d['name']}: {d['accessibility']}"))
        if altitude and d["altitude_m"] >= HIGH_ALTITUDE_M:
            who = "children" if req.children and not (needs - {"wheelchair", "limited_mobility"}) else "your group"
            warnings.append(_w("warning", f"altitude_{did}",
                               f"{d['name']} is at about {d['altitude_m']:,} m. Thin air affects {who} more: keep the "
                               "visit short, and ask a doctor beforehand if anyone has heart or breathing problems or "
                               "is an infant."))
        if req.children and did == "k2":
            warnings.append(_w("danger", "k2_children", "The K2 trek is not suitable for children."))
    if "wheelchair" in needs:
        warnings.append(_w("info", "access_rooms", "Step-free rooms are rare in the mountains: confirm access with each "
                                                   "hotel before booking."))
    if req.food:
        warnings.append(_w("info", "food", f"Food preference noted ({req.food}). Tell hotels in advance; choices are "
                                           "limited in camps and remote places."))


def _check_origin(req: TripRequest, warnings: list[dict]) -> None:
    if req.origin == "Karachi" and req.transport != "flight":
        warnings.append(_w("warning", "karachi_road", "Driving from Karachi to Islamabad takes about 18–22 hours "
                                                       "(around 1,400 km) before the mountain roads begin, so this "
                                                       "plan starts in Islamabad. Most travellers fly."))
    if req.transport == "bus":
        warnings.append(_w("info", "coach", "Public coaches run on the KKH and to Skardu, but schedules change: book a "
                                            "day ahead. Places off the highway need a hired jeep or taxi."))


def _stays(req: TripRequest, days: list[dict]) -> list[dict]:
    nights: dict[str, int] = {}
    for d in days:
        if d["overnight"]:
            nights[d["overnight"]["hub"]] = nights.get(d["overnight"]["hub"], 0) + 1
    out = []
    for hub, n in nights.items():
        did, stay = data.stays_for_hub(hub)
        rate = budget.room_rate(hub, req.accommodation)
        item = {"hub": hub, "name": data.place_name(hub), "nights": n, "destination_id": did,
                "budget_rate": {**rate, "basis": "per room per night", "status": "estimate"}}
        if stay:
            match = budget.TIER_MATCH[req.accommodation]
            opts = sorted(stay["options"], key=lambda o: 0 if o["tier"] in match else 1)
            item.update(base=stay["base"], note=stay.get("note"), options=opts, price_note=stay["price_note"])
        else:
            item.update(base=data.place_name(hub), note="Overnight stop on the way. Raahi has no curated stays here yet; "
                                                        "the budget uses a standard rate.", options=[], price_note=None)
        out.append(item)
    return out


def _sources(selected: list[str]) -> list[dict]:
    out, seen = [], set()
    for did in selected:
        for s in data.destination(did)["sources"]:
            if s["url"] not in seen:
                seen.add(s["url"])
                out.append(s)
    out.append({"label": f"Raahi planning data: routes, stays and cost assumptions (curated, reviewed "
                         f"{data.dataset()['meta']['last_reviewed']})", "url": None})
    return out


def _savings(req: TripRequest, total: int) -> list[dict]:
    options = []
    if req.accommodation != "budget":
        options.append(("Switch to budget stays", {"accommodation": "budget"}))
    if req.guide:
        options.append(("Skip the guide", {"guide": False}))
    if req.transport == "flight":
        options.append(("Go by road instead of flying", {"transport": "car"}))
    if req.transport == "car":
        options.append(("Use public coaches instead of a hired car", {"transport": "bus"}))
    if req.days > 3:
        options.append(("Make the trip one day shorter", {"days": req.days - 1}))
    out = []
    for label, change in options:
        alt = build(req.model_copy(update=change), with_savings=False)["budget"]["total"]
        if alt < total:
            out.append({"label": label, "saves_pkr": total - alt, "change": change})
    return sorted(out, key=lambda s: -s["saves_pkr"])


def apply_changes(req: TripRequest, changes: list) -> TripRequest:
    """Apply itinerary changes while keeping every other preference. Re-validates the result."""
    values = req.model_dump()
    edits = {k: dict(v) for k, v in values["day_edits"].items()}
    for ch in changes:
        if ch.op == "set":
            values[ch.field] = ch.value
        elif ch.op == "add_destination":
            did = data.resolve_destination(ch.destination)
            if not did:
                raise PlanError(f"Unknown destination '{ch.destination}'.")
            if did not in values["destinations"]:
                values["destinations"].append(did)
        elif ch.op == "remove_destination":
            did = data.resolve_destination(ch.destination)
            values["destinations"] = [d for d in values["destinations"] if d != did]
            edits = {k: v for k, v in edits.items() if not k.startswith(f"{did}:")}
            if not values["destinations"]:
                raise PlanError("A trip needs at least one destination.")
        elif ch.op == "edit_day":
            e = edits.setdefault(ch.key, {"title": None, "activities": None, "note": None, "variant": 0})
            for f in ("title", "activities", "note"):
                if getattr(ch, f) is not None:
                    e[f] = getattr(ch, f)
        elif ch.op == "reset_day":
            edits.pop(ch.key, None)
        elif ch.op == "regenerate_day":
            e = edits.setdefault(ch.key, {"title": None, "activities": None, "note": None, "variant": 0})
            e.update(title=None, activities=None, variant=(e.get("variant", 0) + 1) % 10)
    values["day_edits"] = edits
    return TripRequest.model_validate(values)


def route_summary(origin: str, destination: str) -> dict:
    """Curated multi-leg route between two places, plus the OSM routing figure and a map link."""
    a, b = routing.resolve_place(origin), routing.resolve_place(destination)
    if not a or not b:
        raise PlanError(f"I have no location data for '{origin if not a else destination}'.")
    pa, pb = ("islamabad" if a == "rawalpindi" else a), ("islamabad" if b == "rawalpindi" else b)
    hops = path(pa, pb) if pa != pb else []
    curated = None
    if hops:
        mv = _move(hops)
        curated = {"km": mv["km"], "hours": mv["hours"], "time": mv["time_label"], "via": mv["via"], "legs": mv["legs"],
                   "driving_days": len(_split(hops)), "status": mv["status"], "verified": False, "notes": mv["notes"]}
    return {"from": data.place_name(a), "to": data.place_name(b), "curated_estimate": curated,
            "routing_engine": routing.osrm(a, b), "maps_url": routing.maps_link(a, b),
            "advice": "Mountain drives take longer than map estimates. Drive in daylight and check road status "
                      "(NHMP 130) on the morning you travel."}


def compact(plan: dict) -> dict:
    """A short version of a plan for the language model (it never needs every field)."""
    return {
        "title": plan["title"],
        "feasibility": plan["feasibility"],
        "days": [{"day": d["day"], "date": d["date"], "key": d["key"], "type": d["type"], "title": d["title"],
                  "overnight": d["overnight"]["name"] if d["overnight"] else None,
                  "moves": [f"{m['from_name']}→{m['to_name']} {m['time_label']}"
                            + (f", leave {m['timing']['depart']}" if m.get("timing", {}).get("depart") else "")
                            for m in d["moves"]],
                  "risks": d["risks"][:2]} for d in plan["days"]],
        "budget": {"total": plan["budget"]["total"], "per_person": plan["budget"]["per_person"],
                   "comparison": plan["budget"]["comparison"].get("message"),
                   "savings": plan["budget"].get("savings", [])[:3], "status": "estimate"},
        "warnings": [w["message"] for w in plan["warnings"][:6]],
        "stays": [{"place": s["name"], "nights": s["nights"]} for s in plan["stays"]],
    }
