"""Eco-Impact Agent: estimated transport emissions of the trip and its alternatives, with assumptions.

Factors are the UK Government greenhouse-gas conversion factors (DESNZ, 2025 edition), the
standard public reference for travel emissions. Pakistan has no equivalent published set, and
mountain driving, vehicle age and occupancy all change the real figure, so every result is a
range with its assumptions, never a measurement.
"""
import math

import planner
from agents.base import Agent, AgentResult
from agents.common import flight_km, people, plan_of, road_km, travel_hours

SOURCE = {"label": "UK Government GHG conversion factors (DESNZ), 2025 edition, as tabulated by GreenCalculus",
          "url": "https://greencalculus.com/data/business-travel-freight-logistics-emission-factors/"}
# kg CO2e. (low, high). The high ends are Raahi's assumptions for mountain roads and older vehicles.
FACTORS = {
    "car": {"per": "vehicle-km", "low": 0.210, "high": 0.273,
            "basis": "Large diesel car 0.210 kg/km (DESNZ); up to 30% more for steep mountain roads (assumption)."},
    "bus": {"per": "passenger-km", "low": 0.028, "high": 0.060,
            "basis": "Coach 0.028 kg per passenger-km (DESNZ); up to about double for older buses on mountain roads (assumption)."},
    "flight": {"per": "passenger-km", "low": 0.136, "high": 0.229,
               "basis": "Domestic flight 0.136 kg per passenger-km, or 0.229 with the effect of emissions at altitude (DESNZ)."},
}
VEHICLE_SEATS = 4


def footprint(plan: dict) -> dict:
    req = plan["request"]
    n = req["adults"] + req["children"]
    vehicles = math.ceil(n / VEHICLE_SEATS)
    road, air = road_km(plan), flight_km(plan)
    mode = req["transport"]
    parts = []
    if mode == "bus":
        f = FACTORS["bus"]
        parts.append(("Public coach", road * n, f))
    else:
        f = FACTORS["car"]
        parts.append(("Hired 4×4", road * vehicles, f))
    if air:
        parts.append(("Flights", air * n, FACTORS["flight"]))
    low = sum(units * f["low"] for _, units, f in parts)
    high = sum(units * f["high"] for _, units, f in parts)
    lo_h, hi_h = travel_hours(plan)
    return {"transport": mode, "road_km": road, "flight_km": air, "people": n, "vehicles": vehicles,
            "kg_co2e": [round(low), round(high)], "kg_co2e_per_person": [round(low / n), round(high / n)],
            "parts": [{"label": label, "units": round(units), "per": f["per"], "basis": f["basis"]} for label, units, f in parts],
            "cost_pkr": plan["budget"]["total"], "travel_hours": [lo_h, hi_h], "feasible": plan["feasibility"]["ok"]}


TIPS = {
    "deosai": "Deosai is a national park: stay on the tracks, don't feed wildlife and take every piece of litter out.",
    "fairy-meadows": "Fairy Meadows has no waste collection: carry your rubbish back down to the road.",
    "khunjerab": "Khunjerab National Park protects snow leopards and Marco Polo sheep: don't leave the road or feed animals.",
    "k2": "On the Baltoro, use the operator's waste and toilet arrangements and pack out everything you bring.",
}


class EcoAgent(Agent):
    name = "eco"
    label = "Eco-Impact"
    description = "Estimated transport emissions of the plan and its alternatives, with cost and time alongside."
    depends_on = ("itinerary",)

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        req = bb.request
        current = self.tool(tracer, tid, "eco.footprint", footprint, plan)
        options = [{"label": "This plan", **current}]
        for label, change in (("Public coaches", {"transport": "bus"}), ("Hired 4×4", {"transport": "car"}),
                              ("Fly north", {"transport": "flight"})):
            if req.transport == change["transport"]:
                continue
            with planner.closures(bb.closures):
                alt = self.tool(tracer, tid, f"planner.build({change['transport']})", planner.build,
                                req.model_copy(update=change), with_savings=False)
            options.append({"label": label, "change": change, **footprint(alt)})
        lowest = min(options, key=lambda o: o["kg_co2e"][1])
        tips = ["Share vehicles: a full 4×4 has a quarter of the emissions per person of one carrying a single traveller.",
                "Stay in locally owned guesthouses and hire local guides so more of what you spend stays in the valley.",
                "Carry a refillable bottle: plastic bottles are a big part of the litter at northern viewpoints."]
        tips = [TIPS[d] for d in req.destinations if d in TIPS] + tips
        summary = (f"This plan: about {current['kg_co2e'][0]:,}–{current['kg_co2e'][1]:,} kg CO2e from transport "
                   f"({current['kg_co2e_per_person'][0]}–{current['kg_co2e_per_person'][1]} per person); "
                   f"lowest option: {lowest['label']}")
        return AgentResult(True, {"current": current, "options": options, "lowest": lowest["label"], "tips": tips,
                                  "assumptions": [f["basis"] for f in FACTORS.values()] + [
                                      f"One vehicle per {VEHICLE_SEATS} travellers.",
                                      "Flight distance is the straight line between airports plus 10%.",
                                      "Transport only: hotels, food and activities are not included."],
                                  "note": "Estimates from published average factors, not measurements."},
                           summary, confidence="low", sources=[SOURCE])
