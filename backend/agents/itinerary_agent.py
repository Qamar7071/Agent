"""Itinerary Planning Agent: the day-by-day plan from Raahi's deterministic planner.

The planner orders stops along the real road network, splits long drives at towns with beds,
times departures by daylight and checks feasibility. When the trip doesn't fit by road, this
agent also builds the flying alternative so the traveller can choose.
"""
import planner
from agents.base import Agent, AgentResult
from agents.common import travel_hours


def _build(req, closures):
    with planner.closures(closures):
        return planner.build(req)


def brief(plan: dict) -> dict:
    lo, hi = travel_hours(plan)
    return {"title": plan["title"], "days": len(plan["days"]), "feasible": plan["feasibility"]["ok"],
            "minimum_days": plan["feasibility"]["minimum_days"], "travel_hours": [lo, hi],
            "total_pkr": plan["budget"]["total"], "per_person_pkr": plan["budget"]["per_person"],
            "transport": plan["request"]["transport"]}


class ItineraryAgent(Agent):
    name = "itinerary"
    label = "Itinerary Planner"
    description = "Builds the day-by-day plan along the real road network and checks it is realistic."
    depends_on = ("memory", "research")
    soft_depends = ("memory", "research")

    def run(self, bb, tracer, tid):
        req = bb.request
        plan = self.tool(tracer, tid, "planner.build", _build, req, bb.closures)
        alternatives = []
        if not plan["feasibility"]["ok"] and req.transport != "flight":
            fly = self.tool(tracer, tid, "planner.build(flight)", _build, req.model_copy(update={"transport": "flight"}),
                            bb.closures)
            alternatives.append({"label": "Fly to Gilgit or Skardu", "change": {"transport": "flight"}, **brief(fly)})
        f = plan["feasibility"]
        if f["ok"]:
            summary = (f"{len(plan['days'])}-day plan: {f['travel_days']} mainly travel days, "
                       f"{len(plan['days']) - f['travel_days']} to explore")
        else:
            summary = f"{f['requested_days']} days is too short: this route needs at least {f['minimum_days']} days"
        return AgentResult(True, {"plan": plan, "brief": brief(plan), "alternatives": alternatives}, summary,
                           confidence="high" if f["ok"] else "medium",
                           issues=[] if f["ok"] else [{"code": "infeasible", "message": summary}])
