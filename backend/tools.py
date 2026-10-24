"""Agent tools: live weather (Open-Meteo), destination matching, Google Maps links,
and a deterministic trip planner (distances + budget + stays). No fabricated live data.
"""
import math
from datetime import date, timedelta

import requests

from data import (
    DESTINATIONS, ALIASES, ROUTE_ORDER, COORDS, ORIGIN_KEY, SLEEP_HUB, CLUSTER_GATEWAY,
    LEGS, STAYS, COST_MODEL, COST_ASSUMPTIONS, SEASON_NOTES, season_of,
)

LOWLAND = {"Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar"}

WMO = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Rain showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Storm w/ hail", 99: "Storm w/ hail",
}


# ── Live weather ──────────────────────────────────────────────────────────────
def get_weather(lat: float, lng: float, days: int = 7) -> dict | None:
    """Real forecast from Open-Meteo (free, no key). Returns None on failure."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
        f"&timezone=Asia%2FKarachi&forecast_days={days}"
    )
    try:
        r = requests.get(url, timeout=12)
        r.raise_for_status()
        j = r.json()
        cur, dl = j["current"], j["daily"]
        return {
            "current": {
                "temp": round(cur["temperature_2m"]),
                "label": WMO.get(cur["weather_code"], "—"),
                "wind": round(cur["wind_speed_10m"]),
                "humidity": round(cur["relative_humidity_2m"]),
            },
            "daily": [
                {"date": d, "label": WMO.get(dl["weather_code"][i], "—"),
                 "max": round(dl["temperature_2m_max"][i]), "min": round(dl["temperature_2m_min"][i]),
                 "rain": dl["precipitation_probability_max"][i]}
                for i, d in enumerate(dl["time"])
            ],
        }
    except Exception:
        return None


def weather_summary_for(ids: list[str]) -> str:
    """Compact live-weather context string for the LLM (honest, from Open-Meteo)."""
    lines = []
    for did in ids[:4]:
        d = DESTINATIONS.get(did)
        if not d:
            continue
        w = get_weather(*d["ll"], days=3)
        if not w:
            lines.append(f"- {d['name']}: live weather unavailable right now.")
            continue
        c = w["current"]
        tom = w["daily"][1] if len(w["daily"]) > 1 else w["daily"][0]
        lines.append(
            f"- {d['name']}: now {c['temp']}°C {c['label']}, wind {c['wind']} km/h; "
            f"next days high {w['daily'][0]['max']}–{tom['max']}°C, low {w['daily'][0]['min']}°C, "
            f"rain chance {w['daily'][0]['rain']}%."
        )
    return "\n".join(lines)


# ── Matching & maps ───────────────────────────────────────────────────────────
def match_destinations(text: str) -> list[str]:
    t = (text or "").lower()
    out = []
    for did, al in ALIASES.items():
        if any(a in t for a in al):
            out.append(did)
    return out


def maps_directions(a: str, b: str) -> str:
    ca, cb = COORDS.get(a), COORDS.get(b)
    if not ca or not cb:
        return ""
    return f"https://www.google.com/maps/dir/?api=1&origin={ca[0]},{ca[1]}&destination={cb[0]},{cb[1]}&travelmode=driving"


def _haversine(a, b):
    R = 6371
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def leg_between(a: str, b: str):
    if a == b:
        return None
    cur = LEGS.get(f"{a}>{b}") or LEGS.get(f"{b}>{a}")
    if cur:
        km, hours, note = cur
        return {"km": km, "hours": hours, "note": note, "approx": False}
    ca, cb = COORDS.get(a), COORDS.get(b)
    if not ca or not cb:
        return None
    km = round(_haversine(ca, cb) * 1.5 / 5) * 5
    h = km / 35
    return {"km": km, "hours": (max(1, int(h)), math.ceil(h * 1.2)), "note": "Straight-line estimate — open Google Maps for the exact figure.", "approx": True}


def _time_label(hours):
    a, b = hours
    if a == 0 and b == 0:
        return "multi-day trek"
    return f"~{a} h" if a == b else f"{a}–{b} h"


def _leg(a, b, mode="drive"):
    info = leg_between(a, b)
    if not info:
        return None
    return {"fromKey": a, "toKey": b, "mode": mode, "km": info["km"], "time": _time_label(info["hours"]),
            "note": info["note"], "approx": info["approx"], "maps": maps_directions(a, b)}


# ── Deterministic planner (distances + budget + stays) ────────────────────────
def _cluster(did: str) -> str:
    if did in ("skardu", "deosai", "k2"):
        return "skardu"
    if did == "fairy-meadows":
        return "diamer"
    return "hunza"


def build_plan(form: dict) -> dict:
    cm = COST_MODEL
    selected = [i for i in ROUTE_ORDER if i in form.get("destinations", [])]
    if not selected:
        return {"days": [], "warnings": ["Pick at least one destination."], "title": "Your journey", "source": "server"}

    travelers = max(1, int(form.get("travelers") or 1))
    transport = form.get("transport", "car")
    frm = form.get("from", "Islamabad")
    by_air = transport == "flight"
    from_low = frm in LOWLAND
    origin = ORIGIN_KEY.get(frm, "islamabad")
    first_c, last_c = _cluster(selected[0]), _cluster(selected[-1])
    airport_of = lambda c: "skardu" if c == "skardu" else "gilgit"  # noqa: E731
    warnings = []

    # Inbound
    inbound = []
    if from_low:
        ap = airport_of(first_c)
        if by_air:
            inbound.append({"type": "travel", "hub": ap, "title": f"Fly to {'Skardu' if ap == 'skardu' else 'Gilgit'}",
                            "activities": [f"Morning flight {frm} → {'Skardu' if ap == 'skardu' else 'Gilgit'}", "Rest and acclimatise", "Short evening walk"],
                            "notes": ["Northern flights are weather-dependent — keep a buffer day."],
                            "leg": {"fromKey": origin, "toKey": ap, "mode": "flight", "km": None, "time": "~1 h flight", "note": "PIA operates the route when weather allows.", "maps": maps_directions(origin, ap)}})
        else:
            to_key = "skardu" if first_c == "skardu" else "hunza"
            inbound.append({"type": "travel", "hub": "chilas", "title": f"{frm} → Chilas", "activities": ["Early start on the KKH", "Scenic Indus stops", "Overnight in Chilas"], "notes": ["Check KKH status the morning you leave."], "leg": _leg(origin, "chilas")})
            inbound.append({"type": "travel", "hub": to_key if to_key == "skardu" else "hunza", "title": f"Chilas → {'Skardu' if to_key == 'skardu' else 'Hunza'}", "activities": ["Three-ranges junction viewpoint", "Jaglot–Skardu road" if to_key == "skardu" else "Continue up the KKH", "Arrive and rest"], "notes": [], "leg": _leg("chilas", "skardu" if to_key == "skardu" else "gilgit")})

    travel_days = len(inbound) + (len(inbound) if from_low else 0)
    available = int(form.get("days") or 7) - travel_days
    alloc = {i: DESTINATIONS[i]["stay"] for i in selected}
    if "k2" in selected and available < DESTINATIONS["k2"]["duration"][0]:
        warnings.append(f"K2 Base Camp needs at least {DESTINATIONS['k2']['duration'][0]} trekking days — extend your trip or remove it.")
    need = sum(alloc.values())
    minimum = len(selected)
    while need > available and need > minimum:
        longest = max(alloc, key=lambda k: alloc[k])
        if alloc[longest] <= 1:
            break
        alloc[longest] -= 1
        need -= 1
    if need > available:
        warnings.append(f"{form.get('days')} days is tight for these stops — we suggest at least {need + travel_days} days.")
        available = need
    spare = available - need
    if spare > 0 and by_air and from_low:
        spare -= 1
    while spare > 0:
        cand = next((i for i in selected if alloc[i] < DESTINATIONS[i]["duration"][1]), selected[0])
        alloc[cand] += 1
        spare -= 1

    # Stay days
    stay_days = []
    prev_hub = inbound[-1]["hub"] if inbound else origin
    for did in selected:
        d = DESTINATIONS[did]
        hub = SLEEP_HUB[did]
        for i in range(alloc[did]):
            tmpl = d["day_plans"][min(i, len(d["day_plans"]) - 1)]
            repeat = i >= len(d["day_plans"])
            notes, leg = [], None
            if i == 0 and hub != prev_hub:
                leg = _leg(prev_hub, hub, "jeep" if did == "fairy-meadows" else "drive")
                prev_hub = hub
            if i == 0 and d["altitude"] >= 4000:
                notes.append(f"High altitude ({d['altitude']:,} m): ascend slowly and stay hydrated.")
            stay_days.append({"type": "stay", "destinationId": did, "hub": hub, "firstAtDest": i == 0,
                              "title": f"{d['name']}: free day" if repeat else tmpl["title"],
                              "activities": (["Explore at your own pace"] + d["highlights"][-2:]) if repeat else tmpl["activities"],
                              "notes": notes, "leg": leg})

    # Outbound
    outbound = []
    if from_low:
        ap = airport_of(last_c)
        if by_air:
            outbound.append({"type": "travel", "hub": origin, "title": f"Fly home from {'Skardu' if ap == 'skardu' else 'Gilgit'}",
                             "activities": [f"Flight {'Skardu' if ap == 'skardu' else 'Gilgit'} → {'Islamabad' if frm in ('Islamabad', 'Rawalpindi') else frm}"], "notes": [],
                             "leg": {"fromKey": ap, "toKey": origin, "mode": "flight", "km": None, "time": "~1 h flight", "note": "", "maps": maps_directions(ap, origin)}})
        else:
            outbound.append({"type": "travel", "hub": "chilas", "title": "Drive south towards Chilas", "activities": ["Leave early", "Lunch on the KKH", "Overnight on the way"], "notes": [], "leg": _leg(prev_hub, "chilas")})
            outbound.append({"type": "travel", "hub": origin, "title": f"Chilas → {frm}", "activities": ["Final drive south", "Home"], "notes": [], "leg": _leg("chilas", origin)})

    all_days = inbound + stay_days + outbound
    start = form.get("start_date")
    out_days = []
    for idx, d in enumerate(all_days):
        did = d.get("destinationId") or (selected[0] if idx < len(inbound) else selected[-1])
        out_days.append({
            "day": idx + 1,
            "date": _date_str(start, idx) if start else None,
            "destinationId": did, "location": DESTINATIONS[did]["name"] if did else "",
            "title": d["title"], "activities": d.get("activities", []), "notes": d.get("notes", []),
            "leg": d.get("leg"), "hub": d["hub"], "firstAtDest": d.get("firstAtDest", False),
            "transport": None, "stay": None, "cost": None,
        })

    budget = _budget(form, out_days, selected, travelers, by_air, from_low)
    if budget["vsBudget"]["diff"] > 0:
        warnings.append(f"Estimated cost is about PKR {budget['vsBudget']['diff']:,} over your PKR {form.get('budget', 0):,} budget — trim a day, pick budget stays, or share a vehicle.")

    # Stay recommendations (one per base)
    seen, recs = set(), []
    for d in out_days:
        if d["firstAtDest"] and d["hub"] not in seen:
            seen.add(d["hub"])
            s = STAYS.get(d["destinationId"])
            if s:
                recs.append({"destinationId": d["destinationId"], **s})

    names = [DESTINATIONS[i]["name"] for i in selected]
    title = f"{', '.join(names[:-1])} & {names[-1]}" if len(names) > 2 else " & ".join(names)
    return {
        "title": title,
        "summary": f"A {len(out_days)}-day route from {frm}, ordered along the road network with live weather, map links and an estimated budget.",
        "days": out_days, "total_cost": budget["total"], "budget": budget, "stayRecs": recs,
        "warnings": warnings, "source": "server",
    }


def _date_str(start, offset):
    try:
        y, m, d = map(int, start.split("-"))
        return (date(y, m, d) + timedelta(days=offset)).isoformat()
    except Exception:
        return None


def _budget(form, days, selected, t, by_air, from_low):
    cm = COST_MODEL
    camp_hubs = {"askole"}
    room_nights = camp_nights = 0
    for d in days[:-1]:
        if d["hub"] in camp_hubs:
            camp_nights += 1
        else:
            room_nights += 1
    rooms = math.ceil(t / cm["room_sleeps"])
    lodging = room_nights * rooms * cm["room_per_night"] + camp_nights * t * cm["camp_pp_night"]

    road_legs = sum(1 for d in days if d["leg"] and d["leg"]["mode"] != "flight")
    transport = 0
    if by_air and from_low:
        transport += cm["flight_pp_oneway"] * 2 * t
    if form.get("transport") == "bus":
        transport += cm["bus_pp_per_leg"] * max(road_legs, 2) * t
    else:
        transport += cm["vehicle_per_day"] * max(road_legs, round(len(days) / 2))
    excursions = sum(1 for i in selected if i in ("deosai", "fairy-meadows", "k2"))
    transport += excursions * cm["excursion_jeep"]

    food = len(days) * t * cm["food_pp_day"]
    entries = (cm["entries"]["deosai"] * t if "deosai" in selected else 0) + (cm["entries"]["khunjerab"] * t if "khunjerab" in selected else 0)

    total = round(lodging + transport + food + entries)
    lines = [
        {"label": "Flights + local transport" if (by_air and from_low) else "Transport (4×4 / excursions)", "amount": round(transport)},
        {"label": f"Stays ({room_nights} room nights" + (f" + {camp_nights} camp" if camp_nights else "") + ")", "amount": round(lodging)},
        {"label": f"Food ({len(days)} days × {t})", "amount": round(food)},
    ]
    if entries:
        lines.append({"label": "National-park entries", "amount": round(entries)})
    budget_total = form.get("budget") or 0
    return {"total": total, "perPerson": round(total / t), "lines": lines,
            "assumptions": COST_ASSUMPTIONS, "vsBudget": {"budget": budget_total, "diff": total - budget_total}}
