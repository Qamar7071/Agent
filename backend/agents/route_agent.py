"""Route Optimization Agent: the road sections each travel day uses, live routing checks and alternatives.

Drive times in the plan are Raahi's curated mountain estimates. For the longest drives this
agent also asks the OSRM routing engine (OpenStreetMap data) for a free-flow figure as a
cross-check, and labels it as such. It reports when a closure forces a detour or makes a place
unreachable, and suggests flying where that saves long road days.
"""
from agents.base import Agent, AgentResult
from agents.common import moves, plan_of, road_km, travel_hours
from services import routing
from twin import segments

MAX_LIVE_CHECKS = 3


class RouteAgent(Agent):
    name = "route"
    label = "Route Optimizer"
    description = "Road sections, drive times, a live routing cross-check and alternative routes."
    depends_on = ("itinerary",)

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        req = bb.request
        segs = []
        for day, m in moves(plan):
            if m["mode"] == "flight":
                segs.append({"day": day["day"], "from": m["from_name"], "to": m["to_name"], "mode": "flight",
                             "time": m["time_label"], "note": "Weather-dependent flight; no live schedule."})
                continue
            keys = {leg["key"] for leg in m.get("legs", []) if leg.get("key")}
            segs.append({"day": day["day"], "from": m["from_name"], "to": m["to_name"], "from_id": m["from"],
                         "to_id": m["to"], "mode": m["mode"], "km": m["km"], "hours": m["hours"],
                         "time": m["time_label"], "roads": [s["name"] for s in segments.using(keys)],
                         "leg_keys": sorted(keys), "after_dark_risk": bool((m.get("timing") or {}).get("after_dark_risk")),
                         "round_trip": bool(m.get("round_trip"))})
        longest = sorted([s for s in segs if s["mode"] == "drive"], key=lambda s: -(s["km"] or 0))[:MAX_LIVE_CHECKS]
        live = 0
        for s in longest:
            res = self.tool(tracer, tid, f"osrm.route({s['from_id']}→{s['to_id']})", routing.osrm, s["from_id"], s["to_id"],
                            ok_when=lambda r: r.get("available"))
            s["live_check"] = res
            live += 1 if res.get("available") else 0

        alternatives = []
        long_road = [s for s in segs if s["mode"] == "drive" and (s["hours"] or [0, 0])[1] >= 8]
        if long_road and req.transport != "flight":
            alternatives.append({"kind": "fly", "label": "Fly Islamabad–Gilgit or Skardu instead of the longest drives",
                                 "why": f"{len(long_road)} travel day(s) of 8+ hours on mountain roads",
                                 "caveat": "Northern flights are weather-dependent and often delayed or cancelled.",
                                 "change": {"transport": "flight"}})
        closures = [{"id": s["id"], "name": s["name"]} for s in segments.all_segments()
                    if bb.closures and set(s["legs"]) & bb.closures]
        if closures:
            used = {k for s in segs for k in s.get("leg_keys", [])}
            blocked = used & set(bb.closures)
            tracer.note(f"Route check: {len(blocked)} closed legs still used by the plan")
        lo, hi = travel_hours(plan)
        summary = (f"{len(segs)} travel legs, {road_km(plan)} km by road, {lo:g}–{hi:g} h on the move; "
                   f"live routing checked {live} of {len(longest)}")
        return AgentResult(True, {"segments": segs, "road_km": road_km(plan), "travel_hours": [lo, hi],
                                  "alternatives": alternatives, "closures": closures,
                                  "note": "Curated mountain drive times; OSRM figures are free-flow and ignore closures."},
                           summary, confidence="medium",
                           sources=[{"label": "OSRM routing engine (OpenStreetMap data)", "url": "https://project-osrm.org/"}])
