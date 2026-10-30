"""Simulation engine: run a 'what if' on a copy of the trip and compare it with the original.

1. Rebuild the original (baseline) from its request, so both sides use the same data.
2. Apply the scenario to a copy (scenarios.apply): the original is never modified.
3. Run only the agents the scenario affects; the rest are marked as not needed.
4. Validate the simulated plan and compare it with the original.
5. Return both, the differences, assumptions and confidence. Nothing changes until the
   traveller accepts the alternative.
"""
from __future__ import annotations

import time

import config
import data
from agents.base import Blackboard, Tracer
from agents.orchestrator import AGENTS, Runner
from schemas import TripRequest, TripState
from twin import comparison, scenarios

BASELINE_AGENTS = ["itinerary", "weather", "safety", "eco"]
ORDER = ["research", "itinerary", "weather", "route", "budget", "accommodation", "eco", "safety", "packing"]


def _recommend(cmp: dict, spec: dict, sim: dict, notes: list[str]) -> dict:
    if cmp["no_change"]:
        return {"action": "keep", "text": "No change needed: the original plan already works in this scenario."}
    parts = []
    if cmp["destinations"]["removed"]:
        parts.append("skips " + ", ".join(data.place_name(d) for d in cmp["destinations"]["removed"]))
    if cmp["destinations"]["added"]:
        parts.append("adds " + ", ".join(data.place_name(d) for d in cmp["destinations"]["added"]))
    if cmp["length"]["delta"]:
        n = abs(cmp["length"]["delta"])
        parts.append(f"is {n} day{'s' if n > 1 else ''} {'longer' if cmp['length']['delta'] > 0 else 'shorter'}")
    t = cmp["time"]["delta"][1]
    if t:
        parts.append(f"up to {abs(t):g} h {'more' if t > 0 else 'less'} on the road")
    d = cmp["cost"]["delta"]
    parts.append(f"costs PKR {abs(d):,} {'more' if d > 0 else 'less'}" if d else "costs the same")
    if cmp["budget_status"][0] != cmp["budget_status"][1]:
        parts.append(f"budget check: {cmp['budget_status'][0]} → {cmp['budget_status'][1]}")
    if cmp.get("risk"):
        parts.append(f"risk {cmp['risk']['categories'][0]} → {cmp['risk']['categories'][1]}")
    feasible = sim["feasible"]
    action = "accept" if feasible else "review"
    lead = "Recommended alternative" if feasible else "Possible alternative (needs more days than planned)"
    return {"action": action, "text": f"{lead}: it " + "; ".join(parts) + "."}


def simulate(request: dict, scenario: dict | None = None, text: str | None = None, emit=None) -> dict:
    tracer = Tracer(kind="simulation", emit=emit)
    orch = tracer.queue("orchestrator", "Master Orchestrator", "Run the what-if on a copy and compare", initiated_by="user")
    tracer.start(orch, {"scenario": text or (scenario or {}).get("label")})
    twin_tid = tracer.queue("twin", "Travel Twin", "Copy the trip and apply the scenario", initiated_by=orch)
    tracer.start(twin_tid, {"text": text, "scenario": scenario})
    try:
        spec = scenario or scenarios.parse(text or "")
        tracer.tool(twin_tid, "scenario.parse", True, 0, spec["label"])
        req = TripRequest.model_validate(request)
    except Exception as exc:
        tracer.fail(twin_tid, str(exc))
        tracer.fail(orch, "The scenario could not be set up.")
        return {"ok": False, "error": str(exc), "run": tracer.summary()}

    deadline = time.monotonic() + config.AGENT_DEADLINE_S
    base_bb = Blackboard(request=req, state=TripState().absorb(req), deadline=deadline)
    base = Runner(base_bb, tracer, suffix=" (original)")
    base.run(BASELINE_AGENTS)
    base_plan = (base_bb.get("itinerary") or {}).get("plan")
    if not base_plan:
        tracer.fail(twin_tid, "The original trip could not be rebuilt.")
        tracer.fail(orch, "Stopped.")
        return {"ok": False, "error": "The original trip could not be rebuilt.", "run": tracer.summary()}

    try:
        applied = scenarios.apply(req, spec, base_plan)
    except scenarios.ScenarioError as exc:
        tracer.tool(twin_tid, "scenario.apply", False, 0, str(exc))
        tracer.finish(twin_tid, {"scenario": spec["label"]}, "Scenario leaves no workable trip", status="completed")
        tracer.finish(orch, {"verdict": "no_alternative"}, "Explained why no alternative exists")
        original = comparison.summarize(base_plan, base_bb.get("safety"), base_bb.get("eco"))
        return {"ok": True, "scenario": spec, "no_alternative": True, "message": str(exc), "original": original,
                "run": tracer.summary()}
    tracer.tool(twin_tid, "scenario.apply", True, 0, "; ".join(applied["notes"])[:200] or "applied")
    tracer.finish(twin_tid, {"scenario": spec["label"], "assumptions": applied["assumptions"],
                             "changes": applied["notes"]},
                  f"Created an independent copy with: {spec['label']}")

    sim_bb = Blackboard(request=applied["request"], state=TripState().absorb(applied["request"]),
                        closures=applied["closures"], scenario={**spec, **(applied["overlay"] or {})},
                        hints=dict(applied["hints"]), deadline=deadline)
    names = [n for n in ORDER if n in applied["agents"]]
    if "safety" in names and "weather" not in names:
        names.insert(names.index("safety"), "weather")
    for n in ORDER:
        if n not in names:
            tracer.skip(n, AGENTS[n].label + " (scenario)", AGENTS[n].description, "Not affected by this scenario")
    sim = Runner(sim_bb, tracer, suffix=" (scenario)")
    sim.run(names, initiated_by=twin_tid)
    v = sim.validate(1)
    sim_plan = (sim_bb.get("itinerary") or {}).get("plan")
    if not sim_plan:
        tracer.fail(orch, "The scenario plan could not be built.")
        return {"ok": False, "error": "The scenario plan could not be built.", "run": tracer.summary()}

    original = comparison.summarize(base_plan, base_bb.get("safety"), base_bb.get("eco"))
    simulated = comparison.summarize(sim_plan, sim_bb.get("safety"), sim_bb.get("eco"))
    cmp_tid = tracer.queue("comparison", "Comparison Engine", "Compare the original and simulated trips",
                           depends_on=[t for t in (base.task_of.get("itinerary"), sim.task_of.get("itinerary")) if t],
                           initiated_by=orch)
    tracer.start(cmp_tid, {"original_days": original["days"], "simulated_days": simulated["days"]})
    cmp = comparison.compare(original, simulated)
    tracer.finish(cmp_tid, {"days_changed": cmp["days_changed"], "cost_delta": cmp["cost"]["delta"],
                            "risk_delta": (cmp.get("risk") or {}).get("delta")},
                  f"{cmp['days_changed']} day(s) differ; cost {cmp['cost']['delta']:+,} PKR")
    rec = _recommend(cmp, spec, simulated, applied["notes"])
    tracer.finish(orch, {"recommendation": rec["action"]}, "Proposed an alternative and is waiting for your decision"
                  if rec["action"] != "keep" else "No change needed",
                  status="waiting_for_approval" if rec["action"] != "keep" else "completed")
    return {"ok": True, "scenario": spec, "assumptions": applied["assumptions"], "changes": applied["notes"],
            "confidence": applied["confidence"], "confidence_reason": applied["confidence_reason"],
            "original": original, "simulated": simulated, "comparison": cmp, "recommendation": rec,
            "simulated_request": sim_plan["request"], "simulated_plan": sim_plan,
            "agents": {k: v for k, v in sim_bb.results.items() if k != "itinerary"},
            "validation": v, "run": tracer.summary()}
