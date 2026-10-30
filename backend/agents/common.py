"""Small helpers shared by the agents: reading a plan's travel figures."""
import math

import data


def plan_of(bb) -> dict | None:
    it = bb.get("itinerary")
    return it.get("plan") if it else None


def moves(plan: dict) -> list[tuple[dict, dict]]:
    """(day, move) pairs in trip order."""
    return [(d, m) for d in plan["days"] for m in d.get("moves", [])]


def travel_hours(plan: dict) -> tuple[float, float]:
    lo = sum(m["hours"][0] for _, m in moves(plan) if m.get("hours"))
    hi = sum(m["hours"][1] for _, m in moves(plan) if m.get("hours"))
    return round(lo, 1), round(hi, 1)


def road_km(plan: dict) -> int:
    return int(sum((m.get("km") or 0) * (2 if m.get("round_trip") else 1) for _, m in moves(plan) if m["mode"] != "flight"))


def great_circle_km(a: str, b: str) -> float | None:
    ca, cb = data.coords(a), data.coords(b)
    if not ca or not cb:
        return None
    la1, lo1, la2, lo2 = map(math.radians, (*ca, *cb))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def flight_km(plan: dict) -> float:
    """Flown distance: straight line between airports plus 10% for the flight path (an assumption)."""
    total = 0.0
    for _, m in moves(plan):
        if m["mode"] == "flight":
            gc = great_circle_km(m["from"], m["to"])
            total += (gc or 0) * 1.1
    return round(total)


def leg_keys_by_day(plan: dict) -> dict[int, set[str]]:
    out: dict[int, set[str]] = {}
    for d in plan["days"]:
        keys = out.setdefault(d["day"], set())
        for m in d.get("moves", []):
            for leg in m.get("legs", []):
                if leg.get("key"):
                    keys.add(leg["key"])
    return out


def people(req) -> int:
    return req.adults + req.children
