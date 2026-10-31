"""Accommodation Research Agent: where to sleep each night, matched to what the budget allows.

Uses Raahi's curated stays (indicative ranges, not quotes) and, where it answers quickly,
OpenStreetMap listings (real places, no prices). Booking availability is never known here,
and the result says so.
"""
from agents.base import Agent, AgentResult
from agents.common import plan_of
from services import places
from money import rs


class AccommodationAgent(Agent):
    name = "accommodation"
    label = "Accommodation Research"
    description = "Stays for each overnight town that fit the budget, from the guide and OpenStreetMap."
    depends_on = ("itinerary",)

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        allowance = (plan["budget"].get("stay_allowance") or {}).get("per_room_night")
        towns = []
        for s in plan["stays"]:
            town = places.resolve_town(s["hub"])
            if not town or town in places.NO_LISTINGS:
                towns.append({"town": s["name"], "nights": s["nights"], "options": [], "note": s.get("note")})
                continue
            res = self.tool(tracer, tid, f"stays({town})", places.stays, town, None, allowance or None, True,
                            ok_when=lambda r: r.get("available", True))
            curated = (res.get("curated") or {}).get("options", [])
            fits = [o for o in curated if o.get("in_range") is not False]
            live = res.get("live") or {}
            towns.append({"town": res["name"], "nights": s["nights"],
                          "options": [{"name": o["name"], "tier": o["tier"], "pkr_per_night": [o["from"], o["to"]],
                                       "fits_budget": o.get("in_range")} for o in (fits or curated)[:4]],
                          "openstreetmap": {"available": live.get("available"), "count": live.get("count"),
                                            "reason": live.get("reason")}})
        n_fit = sum(1 for t in towns for o in t["options"] if o.get("fits_budget"))
        summary = (f"{len(towns)} overnight towns; {n_fit} curated stays fit about {rs(allowance)} per room-night"
                   if allowance else f"{len(towns)} overnight towns with indicative stays")
        return AgentResult(True, {"towns": towns, "allowance_per_room_night": allowance,
                                  "note": "Indicative ranges, not quotes. Availability is not known: confirm with the place."},
                           summary, confidence="low" if not allowance else "medium")
