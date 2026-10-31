"""Budget Intelligence Agent: the itemised estimate, the budget check and costed alternatives.

All figures come from Raahi's cost assumptions (reviewed dates in the dataset) and are
estimates, never quotes. Alternatives are priced by re-running the deterministic planner, so
every number shown can be traced to a line in a real plan.
"""
from itertools import product

import planner
from agents.base import Agent, AgentResult
from agents.common import plan_of
from money import rs


def _total(req, closures) -> tuple[int, dict]:
    with planner.closures(closures):
        p = planner.build(req, with_savings=False)
    return p["budget"]["total"], p


def budget_total(req) -> int | None:
    if req.budget_pkr is None:
        return None
    return req.budget_pkr * (req.adults + req.children) if req.budget_basis == "per_person" else req.budget_pkr


def fit_to_budget(req, target_total: int, closures=frozenset()) -> dict:
    """Fewest changes that bring the estimate within target_total (or the cheapest if none does)."""
    stays = list(dict.fromkeys([req.accommodation, "mid", "budget"]))
    stays = stays[stays.index(req.accommodation):] if req.accommodation in stays else stays
    transports = list(dict.fromkeys([req.transport, "car" if req.transport == "flight" else req.transport, "bus"]))
    day_opts = [req.days] + ([req.days - 1] if req.days > 2 else [])
    tried = []
    for acc, tr, days in product(stays, transports, day_opts):
        change = {k: v for k, v in (("accommodation", acc), ("transport", tr), ("days", days))
                  if getattr(req, k) != v}
        total, plan = _total(req.model_copy(update=change), closures)
        tried.append({"change": change, "total": total, "feasible": plan["feasibility"]["ok"],
                      "changes": len(change)})
    usable = [t for t in tried if t["feasible"]] or tried
    fitting = sorted([t for t in usable if t["total"] <= target_total], key=lambda t: (t["changes"], t["total"]))
    best = fitting[0] if fitting else min(usable, key=lambda t: t["total"])
    return {"target_total": target_total, "fits": bool(fitting), "best": best, "options_tried": len(tried),
            "shortfall": 0 if fitting else best["total"] - target_total}


class BudgetAgent(Agent):
    name = "budget"
    label = "Budget Intelligence"
    description = "Itemised estimate for the group and per person, the budget check and cheaper options."
    depends_on = ("itinerary",)

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        req = bb.request
        b = plan["budget"]
        cmp = b["comparison"]
        compare = []
        variants = [("Public coaches", {"transport": "bus"}), ("Budget stays", {"accommodation": "budget"}),
                    ("Fly north", {"transport": "flight"})]
        for label, change in variants:
            if all(getattr(req, k) == v for k, v in change.items()):
                continue
            total, alt = self.tool(tracer, tid, f"planner.price({label})", _total, req.model_copy(update=change),
                                   bb.closures)
            compare.append({"label": label, "change": change, "total": total, "difference": total - b["total"],
                            "feasible": alt["feasibility"]["ok"]})
        target = bb.hints.get("budget_target")
        fit = None
        if target:
            fit = self.tool(tracer, tid, "optimizer.fit_to_budget", fit_to_budget, req, target, bb.closures)
        elif cmp.get("status") == "over":
            fit = self.tool(tracer, tid, "optimizer.fit_to_budget", fit_to_budget, req,
                            cmp["budget_total_equivalent"], bb.closures)
        verdict = {"within": "within budget", "tight": "just over budget", "over": "over budget",
                   "no_budget": "no budget given"}[cmp["status"]]
        summary = f"About {rs(b['total'])} in total ({rs(b['per_person'])} per person): {verdict}"
        if fit and fit["fits"] and fit["best"]["change"]:
            summary += "; found changes that fit"
        issues = [] if cmp["status"] in ("within", "no_budget") else [
            {"code": "over_budget", "message": cmp["message"], "fixable": bool(fit and fit["fits"])}]
        return AgentResult(True, {"total": b["total"], "per_person": b["per_person"], "comparison": cmp,
                                  "by_category": b["by_category"], "lines": b["lines"],
                                  "stay_allowance": b.get("stay_allowance"), "alternatives": compare,
                                  "fit": fit, "status": "estimate", "verified": False, "note": b["note"]},
                           summary, confidence="medium", issues=issues)
