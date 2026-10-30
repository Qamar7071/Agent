"""Validation Agent: checks every specialist's output before anything reaches the traveller.

It confirms required fields, cross-checks agents against each other (budget against plan,
forecast dates against plan dates, risk days against plan days, packing basis against the
forecast), scans for claims Raahi must never make, and decides what happens next: pass, ask an
agent to retry, or wait for the traveller's decision.
"""
import re

from agents.base import Agent, AgentResult
from agents.common import plan_of

FORBIDDEN = re.compile(r"\b(road is open|roads are open|is safe to travel|guaranteed|booking (is )?confirmed|"
                       r"reservation (is )?confirmed|has been booked)\b", re.I)


def check(results: dict, summaries: dict, request) -> dict:
    checks, retries, decisions = [], [], []

    def add(name, ok, message, severity="error"):
        checks.append({"name": name, "ok": ok, "message": message, "severity": "ok" if ok else severity})

    it = results.get("itinerary") or {}
    plan = it.get("plan")
    add("plan_present", bool(plan and plan.get("days")), "The itinerary has days." if plan else "No itinerary was produced.")
    if not plan:
        return {"verdict": "fail", "checks": checks, "retry_requests": [{"agent": "itinerary", "reason": "no plan"}],
                "decisions": []}
    dates = {d.get("date") for d in plan["days"] if d.get("date")}
    if not plan["feasibility"]["ok"]:
        f = plan["feasibility"]
        alts = it.get("alternatives") or []
        decisions.append({"code": "too_short", "message": f"{f['requested_days']} days is too short for this route "
                          f"(needs {f['minimum_days']}). The plan shown uses {f['planned_days']} days.",
                          "options": [{"label": f"Use {f['planned_days']} days", "change": {"days": f["planned_days"]}}]
                          + [{"label": a["label"], "change": a["change"]} for a in alts if a.get("feasible")]})
        add("feasible", False, "The requested length is too short: the traveller must choose.", "decision")
    else:
        add("feasible", True, "The plan fits the requested days.")

    b = results.get("budget")
    if b is not None:
        add("budget_matches_plan", b["total"] == plan["budget"]["total"],
            "Budget agent and plan agree on the total." if b["total"] == plan["budget"]["total"]
            else "Budget total differs from the plan.")
        if b["comparison"]["status"] == "over":
            fit = b.get("fit") or {}
            if fit.get("fits") and fit["best"]["change"]:
                decisions.append({"code": "over_budget", "message": b["comparison"]["message"],
                                  "options": [{"label": "Apply the cheapest changes that fit", "change": fit["best"]["change"]}]})
            add("within_budget", False, b["comparison"]["message"], "warning")
    w = results.get("weather")
    if w is not None:
        wd = {d["date"] for d in w.get("day_weather", [])}
        add("forecast_dates_in_plan", wd <= dates, "Forecast days match plan dates." if wd <= dates
            else "Forecast includes dates outside the plan.")
        retryable = [i for i in summaries.get("_issues", {}).get("weather", []) if i.get("retryable")]
        if retryable:
            retries.append({"agent": "weather", "reason": "; ".join(i["message"] for i in retryable)[:240],
                            "hint": {"weather_retry": True}})
    s = results.get("safety")
    if s is not None:
        add("risk_covers_every_day", len(s["days"]) == len(plan["days"]),
            "A risk score exists for every day." if len(s["days"]) == len(plan["days"]) else "Risk days don't match plan days.")
        unexplained = [d["day"] for d in s["days"] if d["score"] > 0 and not d["factors"]]
        add("risk_has_evidence", not unexplained, "Every risk point has evidence." if not unexplained
            else f"Days {unexplained} have scores without evidence.")
    p = results.get("packing")
    if p is not None and w is not None:
        consistent = (p["basis"].startswith("forecast")) == bool(w.get("day_weather"))
        add("packing_uses_forecast", consistent, "Packing list uses the forecast where there is one." if consistent
            else "Packing basis doesn't match the forecast.", "warning")
    e = results.get("eco")
    if e is not None:
        add("eco_has_assumptions", bool(e.get("assumptions")), "Emission estimates list their assumptions.")
    text = " ".join(str(v) for k, v in summaries.items() if not k.startswith("_"))
    bad = FORBIDDEN.findall(text)
    add("no_unsupported_claims", not bad, "No agent claims open roads, bookings or guarantees." if not bad
        else f"Unsupported claim found: {bad[0]}")
    errors = [c for c in checks if c["severity"] == "error"]
    verdict = "fail" if errors else "needs_approval" if decisions else (
        "pass_with_warnings" if any(c["severity"] == "warning" for c in checks) else "pass")
    return {"verdict": verdict, "checks": checks, "retry_requests": retries, "decisions": decisions}


class ValidationAgent(Agent):
    name = "validation"
    label = "Validation"
    description = "Cross-checks every agent, rejects unsupported claims and asks for retries or a decision."

    def run(self, bb, tracer, tid):
        summaries = dict(bb.hints.get("summaries", {}))
        summaries["_issues"] = bb.hints.get("issues", {})
        out = self.tool(tracer, tid, "validate.cross_check", check, bb.results, summaries, bb.request)
        passed = sum(1 for c in out["checks"] if c["ok"])
        summary = f"{passed}/{len(out['checks'])} checks passed; verdict: {out['verdict'].replace('_', ' ')}"
        status = "waiting_for_approval" if out["verdict"] == "needs_approval" else "completed"
        return AgentResult(out["verdict"] != "fail", out, summary, confidence="high", status=status)
