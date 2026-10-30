"""Scenario manager: read a 'what if' and turn it into explicit changes to a copy of the trip.

Every scenario is an assumption the traveller asks about, never a prediction. `apply()` returns
a modified copy of the request (the original is never touched), the road legs to treat as
closed, any hazard overlay for the safety agent, the assumptions made, and how confident the
simulation can be.
"""
from __future__ import annotations

import re

import data
import planner
from agents.budget_agent import budget_total, fit_to_budget
from agents.common import leg_keys_by_day
from agents.research_agent import season_fit
from services import routing
from twin import segments

PRESETS = [
    {"type": "road_closed", "label": "A road becomes unavailable", "example": "What if the Khunjerab route is closed from day 4?"},
    {"type": "heavy_snow", "label": "Heavy snowfall", "example": "What if heavy snow falls from day 2?"},
    {"type": "budget_change", "label": "Budget drops by 20%", "example": "What if my budget decreases by 20%?"},
    {"type": "days_change", "label": "One day less", "example": "What if I remove one day?"},
    {"type": "destination_closed", "label": "A place becomes inaccessible", "example": "What if Attabad Lake is inaccessible?"},
    {"type": "days_change", "label": "Extend the trip", "example": "What if I extend the trip by 2 days?"},
    {"type": "group_change", "label": "More people", "example": "What if 2 more people join?"},
    {"type": "more_adventure", "label": "More adventure", "example": "What if we want more adventure activities?"},
]
NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "ek": 1, "do": 2, "teen": 3, "a": 1}
HIGH_ALTITUDE_M = 3500
SNOW_SEGMENTS = ("khunjerab", "deosai-road", "fairy-meadows-track", "babusar", "askole-track")


class ScenarioError(ValueError):
    pass


def _num(s: str | None, default: int = 1) -> int:
    if not s:
        return default
    return int(s) if s.isdigit() else NUM_WORDS.get(s, default)


def parse(text: str) -> dict:
    """A structured scenario from a 'what if' sentence (English or Roman Urdu)."""
    t = " " + (text or "").lower().replace("–", "-") + " "
    m = re.search(r"\bday\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+day\b|\bdin\s*(\d+)\b|\b(\d+)\s*(?:wen|ve|th)?\s*din\b", t)
    day = int(next(g for g in m.groups() if g)) if m else None
    dests = data.match_destinations(t)
    if re.search(r"\b(snow|snowfall|snowstorm|blizzard|barf|barfbari)\b", t):
        return {"type": "heavy_snow", "from_day": day or 1, "label": f"Heavy snowfall from day {day or 1}"}
    m = re.search(r"(\d+)\s*(?:%|percent|fisad)", t)
    if m and re.search(r"\b(budget|money|paisay|paise|cost)\b", t):
        pct = int(m.group(1))
        up = re.search(r"\b(increase|increases|more|raise|raised|up|zyada|barh)\b", t)
        pct = pct if up else -pct
        return {"type": "budget_change", "percent": pct, "label": f"Budget {'up' if pct > 0 else 'down'} {abs(pct)}%"}
    road_words = r"(road|route|highway|kkh|pass|track|rasta|raasta|sadak|sarak)"
    closed_words = r"(closed|close|unavailable|blocked|block|band|shut|not available|washed|landslide|cut off)"
    if re.search(rf"\b{road_words}\b.*\b{closed_words}\b|\b{closed_words}\b.*\b{road_words}\b", t):
        seg = segments.find(t)
        if not seg and dests:
            seg = next((s for s in segments.all_segments() if s.get("destination") == dests[0]), None)
        if not seg:
            raise ScenarioError("Which road? For example the Khunjerab route, the KKH between Gilgit and Hunza, "
                                "or the Skardu road.")
        return {"type": "road_closed", "segment": seg["id"], "from_day": day or 1,
                "label": f"{seg['name']} unavailable from day {day or 1}"}
    if dests and re.search(r"\b(inaccessible|not accessible|closed|can'?t go|cannot go|cannot reach|unreachable|"
                           r"not possible|nahi ja|band)\b", t):
        return {"type": "destination_closed", "destination": dests[0], "from_day": day or 1,
                "label": f"{data.destination(dests[0])['name']} inaccessible"}
    m = re.search(r"\b(remove|drop|cut|less|minus|kam)\b.*?\b(\d+|one|two|three|a|ek|do)?\s*(day|days|din)\b"
                  r"|\b(\d+|one|two|three|a|ek|do)\s+(day|days|din)\s+(less|shorter|kam)\b|\bshorter\b", t)
    if m:
        n = _num(m.group(2) or m.group(4))
        return {"type": "days_change", "delta": -n, "label": f"{n} day{'s' if n > 1 else ''} less"}
    m = re.search(r"\b(extend|extended|longer|more|add|zyada|barha)\b.*?\b(\d+|one|two|three|a|ek|do)?\s*(day|days|din)\b"
                  r"|\b(\d+|one|two|three|a|ek|do)\s+(more|extra)\s+(day|days|din)\b|\bextend\b", t)
    if m:
        n = _num(m.group(2) or m.group(4))
        return {"type": "days_change", "delta": n, "label": f"{n} more day{'s' if n > 1 else ''}"}
    m = re.search(r"\b(\d+|one|two|three|four)\s+(more|extra)\s+(people|persons|friends|travell?ers|adults|log)\b"
                  r"|\bgroup\s+(?:of|size)\s+(?:to\s+)?(\d+)\b|\b(\d+)\s+(people|persons)\b", t)
    if m:
        if m.group(1):
            return {"type": "group_change", "add": _num(m.group(1)), "label": f"{_num(m.group(1))} more people"}
        n = int(m.group(4) or m.group(5))
        return {"type": "group_change", "set": n, "label": f"Group of {n}"}
    if re.search(r"\b(adventure|adventurous|thrill|trek|treks|trekking|hike|hiking|more active)\b", t):
        return {"type": "more_adventure", "label": "More adventure activities"}
    raise ScenarioError("I couldn't read that scenario. Try one of the examples, e.g. 'What if the Khunjerab route "
                        "is closed from day 4?'")


def _hub(did: str) -> str:
    return {"k2": "askole"}.get(did, did)


def _origin_key(req) -> str:
    o = routing.resolve_place(req.origin) or "islamabad"
    return "islamabad" if o in ("rawalpindi", "lahore", "karachi", "peshawar") else o


def _replacement(dropped: str, req, month: int | None) -> str | None:
    gw = data.dataset()["cluster_gateway"]
    for d in data.destinations().values():
        did = d["id"]
        if did in req.destinations or did == dropped or did == "k2" or gw.get(did) != gw.get(dropped):
            continue
        if d["altitude_m"] >= HIGH_ALTITUDE_M:
            continue
        if month and not season_fit(did, month).startswith("in season"):
            continue
        return did
    return None


def apply(req, spec: dict, base_plan: dict) -> dict:
    """Return the simulated request and everything the agents need to re-plan it."""
    t = spec["type"]
    month = req.start_date.month if req.start_date else req.travel_month
    upd: dict = {}
    closures: set[str] = set()
    overlay = None
    assumptions, notes, run_agents = [], [], {"itinerary", "budget", "safety", "eco"}
    confidence, why = "medium", ""
    hints: dict = {}
    dests = list(req.destinations)
    from_day = max(1, int(spec.get("from_day") or 1))
    used = leg_keys_by_day(base_plan)

    def drop(did: str, reason: str):
        nonlocal dests
        if did in dests:
            dests = [d for d in dests if d != did]
            notes.append(f"Dropped {data.destination(did)['name']}: {reason}.")
            alt = _replacement(did, req.model_copy(update={"destinations": dests}), month)
            if alt:
                dests.append(alt)
                notes.append(f"Added {data.destination(alt)['name']} instead: same area, in season and below "
                             f"{HIGH_ALTITUDE_M:,} m.")
                run_agents.add("research")

    if t == "road_closed":
        seg = segments.get(spec["segment"])
        affected = {d for d, keys in used.items() if d >= from_day and set(seg["legs"]) & keys}
        assumptions.append(f"{seg['name']} is unavailable from day {from_day} to the end of the trip.")
        if seg.get("note"):
            notes.append(seg["note"])
        if not affected:
            notes.append(f"This plan does not use {seg['name']} from day {from_day}, so nothing has to change.")
            confidence, why = "high", "The plan never needs the closed road after that day."
            run_agents = {"itinerary"}
        else:
            closures |= set(seg["legs"])
            run_agents |= {"route", "accommodation"}
            if seg.get("destination"):
                drop(seg["destination"], f"the only road to it is {seg['name']}")
            why = "The closure is your assumption; the re-plan uses Raahi's road network and today's data."
    elif t == "destination_closed":
        did = spec["destination"]
        assumptions.append(f"{data.destination(did)['name']} cannot be visited during the trip.")
        if did not in dests:
            notes.append(f"{data.destination(did)['name']} is not in this plan, so nothing has to change.")
            run_agents = {"itinerary"}
            confidence, why = "high", "The plan does not visit that place."
        else:
            drop(did, "inaccessible in this scenario")
            run_agents |= {"route", "accommodation", "weather", "packing"}
            why = "Uses Raahi's guide to pick a replacement in the same area."
    elif t == "heavy_snow":
        assumptions += [f"Heavy snowfall from day {from_day}: roads slower and passes above about {HIGH_ALTITUDE_M:,} m "
                        "closed (Khunjerab, Deosai, Babusar, the Fairy Meadows track).",
                        "One spare day is added for delays.",
                        "This is a what-if, not a forecast."]
        for sid in SNOW_SEGMENTS:
            closures |= set(segments.get(sid)["legs"])
        for did in list(dests):
            d = data.destination(did)
            if d["altitude_m"] >= HIGH_ALTITUDE_M - 300 and any(
                    day.get("destination_id") == did and day["day"] >= from_day for day in base_plan["days"]):
                drop(did, f"at about {d['altitude_m']:,} m it would be snowed in")
        upd["days"] = req.days + 1
        overlay = {"hazard_from_day": from_day,
                   "hazard_text": f"Scenario: heavy snowfall from day {from_day} (assumption, not a forecast)",
                   "type": "heavy_snow"}
        if req.transport == "flight":
            notes.append("Flights to Gilgit and Skardu are often cancelled in snow: allow extra days or go by road.")
        run_agents |= {"route", "weather", "packing"}
        confidence, why = "low", "Snowfall effects vary a lot; this shows a cautious version of the trip."
    elif t == "budget_change":
        base_total = budget_total(req) or base_plan["budget"]["total"]
        target = int(round(base_total * (1 + spec["percent"] / 100), -2))
        if budget_total(req) is None:
            assumptions.append(f"No budget was set, so the current estimate (PKR {base_total:,}) is used as the budget.")
        assumptions.append(f"New budget: PKR {target:,} in total ({spec['percent']:+d}%).")
        upd.update(budget_pkr=target, budget_basis="total")
        hints["budget_target"] = target
        fit = fit_to_budget(req.model_copy(update=upd), target)
        change = fit["best"]["change"]
        words = {"accommodation": lambda v: f"{v}-level stays", "transport": lambda v: {"bus": "public coaches",
                 "car": "a hired car", "flight": "flights"}[v], "days": lambda v: f"{v} days instead of {req.days}"}
        if change:
            upd.update(change)
            notes.append("To fit the new budget, the alternative uses " +
                         ", ".join(words[k](v) for k, v in change.items()) + ".")
        else:
            notes.append("The current plan already fits the new budget.")
        if not fit["fits"]:
            notes.append(f"Even the cheapest version found is about PKR {fit['shortfall']:,} over the new budget.")
        run_agents |= {"accommodation"}
        confidence, why = "high", "Costs come from Raahi's assumptions; the search tries stay level, transport and length."
    elif t == "days_change":
        new_days = max(1, min(30, req.days + spec["delta"]))
        upd["days"] = new_days
        assumptions.append(f"Trip length changes from {req.days} to {new_days} days.")
        run_agents |= {"weather", "packing", "accommodation", "route"}
        confidence, why = "high", "Re-planned with the same places and preferences."
    elif t == "group_change":
        adults = spec.get("set") or (req.adults + spec.get("add", 1))
        adults = max(1, min(20, adults))
        upd["adults"] = adults
        assumptions.append(f"Adults change from {req.adults} to {adults}; everything else stays the same.")
        run_agents |= {"accommodation", "packing"}
        confidence, why = "high", "Rooms, vehicles and per-person costs follow Raahi's cost model."
    elif t == "more_adventure":
        upd["pace"] = "active"
        upd["interests"] = list(dict.fromkeys([*req.interests, "adventure", "treks"]))[:10]
        gw = data.dataset()["cluster_gateway"]
        clusters = {gw.get(d) for d in dests}
        pick = next((d["id"] for d in data.destinations().values()
                     if d["id"] not in dests and d["id"] != "k2" and gw.get(d["id"]) in clusters
                     and set(d["category"]) & {"treks", "high"}
                     and (not month or season_fit(d["id"], month).startswith("in season"))), None)
        if pick:
            dests.append(pick)
            notes.append(f"Added {data.destination(pick)['name']} for treks and high places nearby.")
        assumptions.append("Active pace and adventure interests; the trip length stays the same.")
        run_agents |= {"research", "route", "weather", "packing", "accommodation"}
        confidence, why = "medium", "Activities come from Raahi's guide for these places."
    else:
        raise ScenarioError(f"Unknown scenario type '{t}'.")

    if dests != list(req.destinations):
        upd["destinations"] = dests
        run_agents |= {"weather", "packing", "route"}
    if not dests:
        raise ScenarioError("Every place in the trip would be unreachable in this scenario: the only safe option is "
                            "to postpone, or wait for the road to reopen.")
    new_req = req.model_copy(update=upd)
    # Check every remaining place can still be reached; switch to flying if the road is cut.
    if closures:
        origin = _origin_key(new_req)
        with planner.closures(closures):
            cut = [d for d in new_req.destinations if not planner.reachable(origin, _hub(d))]
        if cut and new_req.transport != "flight":
            with planner.closures(closures):
                air_ok = [d for d in cut if planner.reachable("gilgit", _hub(d)) or planner.reachable("skardu", _hub(d))]
            if air_ok:
                new_req = new_req.model_copy(update={"transport": "flight"})
                notes.append("The road from your starting point is cut, so the alternative flies to Gilgit/Skardu "
                             "(weather-dependent).")
                cut = [d for d in cut if d not in air_ok]
        for d in cut:
            notes.append(f"{data.destination(d)['name']} cannot be reached while the road is closed.")
        if cut:
            remaining = [d for d in new_req.destinations if d not in cut]
            if not remaining:
                raise ScenarioError("No place in the trip can be reached while that road is closed: postpone or wait "
                                    "for it to reopen.")
            new_req = new_req.model_copy(update={"destinations": remaining})
    return {"request": new_req, "closures": frozenset(closures), "overlay": overlay, "assumptions": assumptions,
            "notes": notes, "agents": run_agents, "confidence": confidence, "confidence_reason": why, "hints": hints}
