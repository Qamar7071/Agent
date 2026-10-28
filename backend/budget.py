"""Budget engine: transparent, line-by-line trip cost estimates.

Every number comes from Raahi's planning assumptions (shared/destinations.json → cost_model)
or the indicative stay ranges in the same file. So every figure is an estimate, never a
quote: each line says what it covers, who it is for (whole group or per person), how
often it applies (per day, per night, once), and `verified: false`.
"""
import math

import data

# Which curated stay tiers count as each accommodation level.
TIER_MATCH = {
    "budget": ("Budget", "Camp"),
    "mid": ("Mid-range", "Cabins", "View"),
    "premium": ("Premium", "View"),
}
STAY_LABEL = {"budget": "budget guesthouses", "mid": "mid-range hotels", "premium": "premium hotels"}
NO_VEHICLE_DESTS = {"fairy-meadows", "k2"}      # no roads at the meadow or on the glacier


def _round(x: float, step: int = 100) -> int:
    return int(round(x / step) * step)


def room_rate(hub: str, level: str) -> dict:
    """Indicative PKR per room-night for a stay level at an overnight hub."""
    cm = data.cost_model()
    _, stay = data.stays_for_hub(hub)
    options = [o for o in (stay or {}).get("options", []) if o.get("to")]
    picked = [o for o in options if o["tier"] in TIER_MATCH[level]]
    if not picked and level == "premium":
        picked = [o for o in options if o["tier"] in TIER_MATCH["mid"]]
    if not picked and level == "budget":
        picked = [o for o in options if o["tier"] == "Cabins"]
    if picked:
        mid = sum((o["from"] + o["to"]) / 2 for o in picked) / len(picked)
        return {"amount": _round(mid, 500), "low": min(o["from"] for o in picked), "high": max(o["to"] for o in picked),
                "source": f"midpoint of Raahi's indicative ranges for {stay['base']}"}
    flat = cm["room_per_night_by_tier"][level]
    return {"amount": flat, "low": flat, "high": flat, "source": f"Raahi's standard {STAY_LABEL[level]} assumption"}


class _Lines:
    def __init__(self):
        self.items: dict[str, dict] = {}

    def add(self, key: str, category: str, label: str, amount: float, *, basis: str, frequency: str,
            unit_cost: int | None = None, units: int = 1, note: str | None = None) -> float:
        line = self.items.setdefault(key, {
            "id": key, "category": category, "label": label, "amount": 0, "basis": basis, "frequency": frequency,
            "unit_cost": unit_cost, "units": 0, "status": "estimate", "verified": False, "note": note,
            "_rates": set(),
        })
        line["amount"] += amount
        line["units"] += units
        if unit_cost is not None:
            line["_rates"].add(unit_cost)
        return amount


def estimate(req, days: list[dict]) -> dict:
    """Cost every day of an itinerary and roll it up into a budget. Mutates days[i]["cost"]."""
    cm = data.cost_model()
    people = req.adults + req.children
    eaters = req.adults + req.children * cm["child_food_factor"]
    rooms = max(math.ceil(req.adults / cm["room_sleeps"]), math.ceil(people / 4))
    vehicles = math.ceil(people / cm["vehicle_seats"])
    jeeps = math.ceil(people / cm["jeep_seats"])
    lines = _Lines()
    visited_parks: set[str] = set()

    for day in days:
        cost = {"transport": 0.0, "accommodation": 0.0, "food": 0.0, "activities": 0.0, "guide": 0.0}
        moves = day.get("moves", [])
        kind = day["type"]
        dest = day.get("destination_id")
        flights = [m for m in moves if m["mode"] == "flight"]
        ground = [m for m in moves if m["mode"] in ("drive", "jeep")]
        sightseeing = kind in ("stay", "daytrip", "free") and dest not in NO_VEHICLE_DESTS

        for _ in flights:
            cost["transport"] += lines.add(
                "flights", "transport", "Flights (one way each)", cm["flight_pp_oneway"] * people,
                basis="per person", frequency="per flight", unit_cost=cm["flight_pp_oneway"])

        if req.transport == "car":
            if kind != "trek":
                cost["transport"] += lines.add(
                    "vehicle", "transport", "Hired 4×4 with driver", cm["vehicle_per_day"] * vehicles,
                    basis="whole group", frequency="per day", unit_cost=cm["vehicle_per_day"])
        elif req.transport == "flight":
            road = any(m["mode"] == "drive" for m in ground)
            if road or sightseeing or kind == "buffer":
                cost["transport"] += lines.add(
                    "vehicle", "transport", "Local 4×4 with driver", cm["vehicle_per_day"] * vehicles,
                    basis="whole group", frequency="per day", unit_cost=cm["vehicle_per_day"])
        else:  # public coach
            if kind == "travel" and any(m["mode"] == "drive" for m in ground):
                cost["transport"] += lines.add(
                    "coach", "transport", "Public coach seats", cm["bus_pp_per_leg"] * people,
                    basis="per person", frequency="per travel day", unit_cost=cm["bus_pp_per_leg"])
            if sightseeing and kind != "daytrip":
                cost["transport"] += lines.add(
                    "local", "transport", "Local taxis for sightseeing", cm["local_transport_per_day"],
                    basis="whole group", frequency="per day", unit_cost=cm["local_transport_per_day"])

        # Jeeps: Fairy Meadows and Askole tracks need local jeeps whatever you arrive in;
        # day trips to Deosai/Khunjerab need one unless you already have a hired 4×4.
        for m in ground:
            if m["mode"] == "jeep" and m["to"] in ("fairy-meadows", "askole"):
                label = "Jeep, Raikot Bridge ↔ Fairy Meadows track" if m["to"] == "fairy-meadows" else "Jeep, Skardu ↔ Askole"
                cost["transport"] += lines.add(
                    f"jeep-{m['to']}", "transport", label + " (return)", cm["excursion_jeep"] * jeeps,
                    basis="whole group", frequency="per trip", unit_cost=cm["excursion_jeep"])
        if kind == "daytrip" and req.transport != "car":
            cost["transport"] += lines.add(
                f"jeep-{dest}", "transport", f"Hired jeep for the {data.place_name(dest)} day trip",
                cm["excursion_jeep"] * jeeps, basis="whole group", frequency="per trip", unit_cost=cm["excursion_jeep"])

        night = day.get("overnight")
        if night:
            hub = night["hub"]
            if kind == "trek" or hub == "askole":
                cost["accommodation"] += lines.add(
                    "camping", "accommodation", "Camping (trek)", cm["camp_pp_night"] * people,
                    basis="per person", frequency="per night", unit_cost=cm["camp_pp_night"])
            else:
                rate = room_rate(hub, req.accommodation)
                cost["accommodation"] += lines.add(
                    "rooms", "accommodation", f"Rooms ({STAY_LABEL[req.accommodation]})", rate["amount"] * rooms,
                    basis="whole group", frequency="per night", unit_cost=rate["amount"])

        cost["food"] += lines.add("food", "food", "Food", cm["food_pp_day"] * eaters,
                                  basis="per person", frequency="per day", unit_cost=cm["food_pp_day"])

        if kind in ("stay", "daytrip", "free"):
            cost["activities"] += lines.add(
                "activities", "activities", "Sightseeing allowance (tickets, boat rides)",
                cm["activities_pp_day"] * people, basis="per person", frequency="per day",
                unit_cost=cm["activities_pp_day"])
            fee = cm["entries"].get(dest)
            if fee and dest not in visited_parks:
                visited_parks.add(dest)
                cost["activities"] += lines.add(
                    f"entry-{dest}", "activities", f"{data.place_name(dest)} national park entry", fee * people,
                    basis="per person", frequency="once", unit_cost=fee)
            if req.guide and kind in ("stay", "daytrip"):
                cost["guide"] += lines.add("guide", "guide", "Local guide", cm["guide_per_day"],
                                           basis="whole group", frequency="per day", unit_cost=cm["guide_per_day"])

        day["cost"] = {k: _round(v) for k, v in cost.items()}
        day["cost"]["total"] = _round(sum(cost.values()))

    # Roll up
    out_lines = []
    for line in lines.items.values():
        rates = sorted(line.pop("_rates"))
        line["amount"] = _round(line["amount"])
        line["quantity"] = _quantity(line, rates, people=people, vehicles=vehicles, jeeps=jeeps, rooms=rooms,
                                     children=req.children, factor=cm["child_food_factor"])
        out_lines.append(line)
    subtotal = sum(l["amount"] for l in out_lines)
    pct = cm["contingency_pct"]
    contingency = _round(subtotal * pct / 100)
    out_lines.append({"id": "contingency", "category": "contingency", "label": f"Contingency ({pct}%)",
                      "amount": contingency, "basis": "whole group", "frequency": "once", "unit_cost": None,
                      "units": 1, "quantity": f"{pct}% of the subtotal", "status": "estimate", "verified": False,
                      "note": "For delays and closures (an extra night, a changed route) and price changes."})
    total = _round(subtotal + contingency)
    by_category: dict[str, int] = {}
    for line in out_lines:
        by_category[line["category"]] = by_category.get(line["category"], 0) + line["amount"]

    return {
        "currency": "PKR",
        "status": "estimate",
        "verified": False,
        "travellers": {"adults": req.adults, "children": req.children, "total": people},
        "lines": out_lines,
        "by_category": by_category,
        "subtotal": subtotal,
        "contingency": contingency,
        "total": total,
        "per_person": _round(total / people),
        "comparison": compare(req, total, people),
        "assumptions": assumptions(req),
        "not_included": not_included(req),
        "note": "Planning estimate from Raahi's assumptions and indicative ranges. Not a quote: confirm prices "
                "with hotels and transport providers before you pay anything.",
    }


def _n(count: int, word: str, plural: str | None = None) -> str:
    return f"{count} {word if count == 1 else (plural or word + 's')}"


def _quantity(line, rates, *, people, vehicles, jeeps, rooms, children, factor) -> str:
    n = line["units"]
    ppl = _n(people, "person", "people")
    rate = f"PKR {rates[0]:,}" if len(rates) == 1 else (f"PKR {rates[0]:,}–{rates[-1]:,}" if rates else "")
    key = line["id"]
    if key == "vehicle":
        return f"{_n(n, 'day')} × {_n(vehicles, 'vehicle')} × {rate}"
    if key == "flights":
        return f"{_n(n, 'flight')} × {ppl} × {rate}"
    if key == "coach":
        return f"{_n(n, 'travel day')} × {ppl} × {rate}"
    if key == "local":
        return f"{_n(n, 'day')} × {rate}"
    if key.startswith("jeep-"):
        return f"{_n(n, 'trip')} × {_n(jeeps, 'jeep')} × {rate}"
    if key == "rooms":
        return f"{_n(n, 'night')} × {_n(rooms, 'room')} × {rate} per room-night (varies by place)"
    if key == "camping":
        return f"{_n(n, 'night')} × {ppl} × {rate}"
    if key == "food":
        kids = f" (children at about {int(factor * 100)}%)" if children else ""
        return f"{_n(n, 'day')} × {rate} per adult{kids}"
    if key == "activities":
        return f"{_n(n, 'day')} × {ppl} × {rate}"
    if key.startswith("entry-"):
        return f"{ppl} × {rate}"
    if key == "guide":
        return f"{_n(n, 'day')} × {rate}"
    return f"{n} × {rate}"


def compare(req, total: int, people: int) -> dict:
    if req.budget_pkr is None:
        return {"status": "no_budget", "message": "Add your budget to see how this plan compares."}
    per_person = total / people
    if req.budget_basis == "per_person":
        mine, theirs, unit = per_person, req.budget_pkr, "per person"
    else:
        mine, theirs, unit = total, req.budget_pkr, "in total"
    diff = _round(mine - theirs)
    if diff <= 0:
        status, msg = "within", f"About PKR {abs(diff):,} under your budget of PKR {theirs:,} {unit}."
    elif diff <= 0.1 * theirs:
        status, msg = "tight", f"About PKR {diff:,} over your budget of PKR {theirs:,} {unit}: close, but tight."
    else:
        status, msg = "over", f"About PKR {diff:,} over your budget of PKR {theirs:,} {unit}."
    return {"status": status, "budget": theirs, "basis": req.budget_basis, "difference": diff, "message": msg,
            "budget_total_equivalent": theirs * people if req.budget_basis == "per_person" else theirs}


def assumptions(req) -> list[str]:
    cm = data.cost_model()
    out = []
    if req.transport in ("car", "flight"):
        out.append(f"Hired 4×4 with driver: PKR {cm['vehicle_per_day']:,} per vehicle per day, one vehicle per "
                   f"{cm['vehicle_seats']} travellers (fuel and driver included in the assumption).")
    if req.transport == "flight":
        out.append(f"Flights: PKR {cm['flight_pp_oneway']:,} per person each way. Northern flights are "
                   "weather-dependent and fares change.")
    if req.transport == "bus":
        out.append(f"Public coach: PKR {cm['bus_pp_per_leg']:,} per person per travel day; local taxis "
                   f"PKR {cm['local_transport_per_day']:,} per sightseeing day for the group.")
    out.append(f"Rooms: midpoints of Raahi's indicative ranges for {STAY_LABEL[req.accommodation]} at each place "
               f"(or PKR {cm['room_per_night_by_tier'][req.accommodation]:,} where there is no range); "
               f"{cm['room_sleeps']} adults per room, children share.")
    out.append(f"Food: PKR {cm['food_pp_day']:,} per adult per day; children about "
               f"{int(cm['child_food_factor'] * 100)}%.")
    out.append(f"Sightseeing allowance: PKR {cm['activities_pp_day']:,} per person per sightseeing day.")
    out.append(f"Jeeps (Fairy Meadows track, Askole, day trips without a hired 4×4): PKR {cm['excursion_jeep']:,} "
               f"per jeep, up to {cm['jeep_seats']} people.")
    if req.guide:
        out.append(f"Local guide: PKR {cm['guide_per_day']:,} per sightseeing day for the group.")
    out.append(f"Contingency: {cm['contingency_pct']}% on top for delays, closures and price changes.")
    out.append("All figures are planning assumptions, not live prices or quotes.")
    return out


def not_included(req) -> list[str]:
    out = ["Shopping, tips and personal expenses", "Travel insurance"]
    if "k2" in req.destinations:
        out.insert(0, "K2 trekking permit, porters, guide and operator package (ask a licensed operator for a quote)")
    if req.origin == "Karachi" and req.transport != "flight":
        out.insert(0, "Travel between Karachi and Islamabad")
    if req.transport == "car":
        out.append("If you drive your own car, replace the vehicle line with your own fuel and upkeep costs")
    return out
