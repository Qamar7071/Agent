"""Predictive Journey Guardian: re-checks a saved trip and reports what changed since the last check.

Each check runs the itinerary, weather, route and safety agents on the trip as it is now, then
compares the risk with the previous check the traveller's browser sends: new or expired
official alerts, days whose risk category changed, and a recommendation to continue, modify
or reconsider. Checks run when the traveller opens the Guardian or presses "Check now"; there
is no background monitoring without an account (planned with accounts in phase B).
"""
from __future__ import annotations

import time

import config
from agents.base import Blackboard, Tracer
from agents.orchestrator import Runner
from schemas import TripRequest, TripState

AGENTS = ["itinerary", "weather", "route", "safety"]
DECISION = {"Low": "continue", "Moderate": "continue with precautions", "High": "modify", "Severe": "reconsider"}


def changes(previous: dict | None, current: dict) -> list[dict]:
    if not previous:
        return []
    out = []
    p, c = previous.get("overall") or {}, current["overall"]
    if p.get("category") and p["category"] != c["category"]:
        out.append({"kind": "overall", "severity": "high" if c["score"] > p.get("score", 0) else "info",
                    "message": f"Overall risk changed from {p['category']} to {c['category']}."})
    before = {d["day"]: d for d in previous.get("days", [])}
    for d in current["days"]:
        b = before.get(d["day"])
        if b and b.get("category") != d["category"]:
            out.append({"kind": "day", "day": d["day"], "severity": "high" if d["score"] > b.get("score", 0) else "info",
                        "message": f"Day {d['day']} ({d['title']}): {b.get('category')} → {d['category']}."})
    p_alerts, c_alerts = set(previous.get("alert_titles", [])), set(current.get("alert_titles", []))
    for title in sorted(c_alerts - p_alerts):
        out.append({"kind": "alert", "severity": "high", "message": f"New official PMD alert: {title}"})
    for title in sorted(p_alerts - c_alerts):
        out.append({"kind": "alert", "severity": "info", "message": f"No longer active: {title}"})
    return out


def check(request: dict, previous: dict | None = None, emit=None) -> dict:
    tracer = Tracer(kind="guardian", emit=emit)
    orch = tracer.queue("orchestrator", "Master Orchestrator", "Re-check the trip and report changes", initiated_by="user")
    tracer.start(orch, {"previous_check": (previous or {}).get("checked_at")})
    req = TripRequest.model_validate(request)
    bb = Blackboard(request=req, state=TripState().absorb(req), deadline=time.monotonic() + config.AGENT_DEADLINE_S)
    Runner(bb, tracer).run(AGENTS)
    risk = bb.get("safety")
    if not risk:
        tracer.fail(orch, "The safety check could not run.")
        return {"ok": False, "error": "The safety check could not run. Try again in a minute.", "run": tracer.summary()}
    weather = bb.get("weather") or {}
    alert_titles = [a["title"] for a in (weather.get("alerts") or {}).get("items", []) if a.get("active")]
    current = {**risk, "alert_titles": alert_titles}
    diff = changes(previous, current)
    o = risk["overall"]
    decision = DECISION[o["category"]]
    tracer.say(orch, "decision", f"Recommendation: {decision} (overall {o['category']}, {o['score']}/100, worst on day "
               f"{o['worst_day']}). {len(diff)} change(s) since the last check.",
               reason="A heuristic from public data, not an official safety assessment.",
               evidence=[{"source": "Raahi risk model", "detail": f"confidence {risk.get('confidence')}"}])
    tracer.finish(orch, {"decision": decision, "changes": len(diff)},
                  f"Recommendation: {decision}; {len(diff)} change(s) since the last check")
    return {"ok": True, "checked_at": risk["checked_at"], "assessment": current, "changes": diff,
            "decision": decision, "plan_title": (bb.get("itinerary") or {}).get("plan", {}).get("title"),
            "weather": {"available": weather.get("available"), "reason": weather.get("reason"),
                        "impacts": weather.get("impacts", []), "alerts": weather.get("alerts")},
            "route": {k: (bb.get("route") or {}).get(k) for k in ("segments", "alternatives", "travel_hours")},
            "monitoring": "Checked now. Raahi re-checks when you open the Guardian or press Check now.",
            "run": tracer.summary()}
