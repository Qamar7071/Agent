"""Master Orchestrator: turns a request into a task plan, runs the specialist agents and validates the result.

1. The Memory Agent reads the message into the structured trip state.
2. The orchestrator picks only the agents the request needs and orders them by their
   dependencies; agents whose inputs are ready run in parallel.
3. The Validation Agent cross-checks the outputs. If an agent's result is fixable (for example
   a weather service that failed), the orchestrator asks that agent, and anything depending on
   it, to run again, at most once.
4. Decisions that belong to the traveller (too few days, over budget) are returned as choices
   and the run waits for approval instead of changing the trip on its own.
5. The result is one coordinated answer, the full plan, every agent's output, the Travel Twin
   baseline and the complete execution trace.

Everything the Agent Control Center shows comes from this trace.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import config
from agents.accommodation_agent import AccommodationAgent
from agents.base import AgentError, Blackboard, Tracer
from agents.budget_agent import BudgetAgent
from agents.eco_agent import EcoAgent
from agents.itinerary_agent import ItineraryAgent
from agents.memory_agent import MemoryAgent
from agents.packing_agent import PackingAgent
from agents.research_agent import ResearchAgent
from agents.route_agent import RouteAgent
from agents.safety_agent import SafetyAgent
from agents.validation_agent import FORBIDDEN, ValidationAgent
from agents.voices import speak
from agents.weather_agent import WeatherAgent
from schemas import TripState
from services import http
from money import rs

log = logging.getLogger("raahi.orchestrator")

AGENTS = {a.name: a for a in (MemoryAgent(), ResearchAgent(), ItineraryAgent(), WeatherAgent(), RouteAgent(),
                               BudgetAgent(), AccommodationAgent(), SafetyAgent(), PackingAgent(), EcoAgent(),
                               ValidationAgent())}

# Which specialists each kind of request needs (memory and validation always run).
INTENT_AGENTS = {
    "plan": ["research", "itinerary", "weather", "route", "budget", "accommodation", "eco", "safety", "packing"],
    "safety": ["itinerary", "weather", "route", "safety"],
    "packing": ["itinerary", "weather", "packing"],
    "eco": ["itinerary", "eco"],
    "budget": ["itinerary", "budget"],
    "stays": ["itinerary", "budget", "accommodation"],
    "research": ["research"],
}
INTENT_WORDS = [
    ("packing", r"\b(pack|packing|what to (bring|carry|take)|samaan|saman)\b"),
    ("eco", r"\b(eco|carbon|co2|emission|emissions|environment|footprint|green)\b"),
    ("safety", r"\b(safe|safety|risk|risky|danger|dangerous|hazard|khatra|landslide)\b"),
    ("stays", r"\b(hotel|hotels|stay|stays|guest ?house|accommodation)\b"),
    ("budget", r"\b(budget|cost|costs|kharcha|cheaper|price)\b"),
]
OUTPUT_KEYS = {
    "memory": ("stated_now", "applied_preferences", "missing"),
    "research": ("out_of_season", "live_research", "data_reviewed"),
    "itinerary": ("brief",),
    "weather": ("available", "reason"),
    "route": ("road_km", "travel_hours", "closures"),
    "budget": ("total", "per_person", "status"),
    "accommodation": ("allowance_per_room_night",),
    "safety": ("overall", "confidence"),
    "packing": ("basis",),
    "eco": ("lowest",),
    "validation": ("verdict",),
}


def detect_intent(message: str, requested: str | None = None) -> str:
    if requested in INTENT_AGENTS:
        return requested
    t = (message or "").lower()
    if re.search(r"\b(plan|itinerary|schedule)\b", t):
        return "plan"
    focused = [i for i, p in INTENT_WORDS if re.search(p, t)]
    # "what to pack for 6 days" is about packing; "a 5-day trip with a 150k budget" is still a plan.
    for intent in focused:
        if intent in ("packing", "eco", "safety"):
            return intent
    if re.search(r"\b(trip|tour|days?|din)\b", t):
        return "plan"
    return focused[0] if focused else "plan"


def _outputs(name: str, data: dict) -> dict:
    out = {k: data.get(k) for k in OUTPUT_KEYS.get(name, ()) if k in data}
    if name == "budget":
        out["status"] = (data.get("comparison") or {}).get("status")
    if name == "weather":
        out["forecast_days"] = len(data.get("day_weather", []))
        out["weather_risk_days"] = len(data.get("impacts", []))
    if name == "packing":
        out["items"] = len(data.get("items", []))
    if name == "eco":
        out["kg_co2e"] = (data.get("current") or {}).get("kg_co2e")
    if name == "accommodation":
        out["towns"] = len(data.get("towns", []))
    if name == "validation":
        out["checks_passed"] = sum(1 for c in data.get("checks", []) if c["ok"])
        out["checks"] = len(data.get("checks", []))
        out["decisions"] = len(data.get("decisions", []))
    return out


def _inputs(bb: Blackboard, name: str) -> dict:
    req = bb.request
    base = {"message": bb.message[:200]} if name == "memory" else {}
    if req is not None and name != "memory":
        base.update(destinations=list(req.destinations), days=req.days, start=str(req.start_date or req.travel_month or "—"),
                    travellers=req.adults + req.children, transport=req.transport, budget_pkr=req.budget_pkr)
    deps = [d for d in AGENTS[name].depends_on if d in bb.results]
    if deps:
        base["uses"] = deps
    if bb.scenario and name != "memory":
        base["scenario"] = bb.scenario.get("label")
    return base


class Runner:
    """Runs agents on a blackboard in dependency order, in parallel where possible."""

    def __init__(self, bb: Blackboard, tracer: Tracer, suffix: str = ""):
        self.bb, self.tracer, self.suffix = bb, tracer, suffix
        self.task_of: dict[str, str] = {}
        self.summaries: dict[str, str] = {}
        self.issues: dict[str, list] = {}

    def _run_one(self, name: str, tid: str) -> None:
        agent = AGENTS[name]
        self.tracer.start(tid, _inputs(self.bb, name))
        try:
            if time.monotonic() > self.bb.deadline:
                raise AgentError("Out of time for this request.")
            res = agent.run(self.bb, self.tracer, tid)
        except Exception as exc:  # an agent failure is reported, never hidden
            log.warning("agent %s failed: %s", name, exc, exc_info=not isinstance(exc, AgentError))
            self.tracer.fail(tid, f"{type(exc).__name__}: {exc}"[:240])
            self.tracer.say(tid, "concern", f"{agent.label} could not finish: {exc}"[:240],
                            reason="The other agents carry on without it, and the answer says what is missing.")
            return
        self.bb.results[name] = res.data
        self.summaries[name] = res.summary
        self.issues[name] = res.issues
        speak(name, res.data, self.bb, self.tracer, tid)
        self.tracer.finish(tid, _outputs(name, res.data), res.summary, status=res.status)

    def run(self, names: list[str], initiated_by: str = "orchestrator") -> None:
        names = [n for n in names if n in AGENTS]
        pending = {}
        for n in names:
            if n == "validation":   # checks everything that has run so far
                deps = [tid for name, tid in self.task_of.items() if name in self.bb.results and name != "validation"]
            else:
                deps = [self.task_of.get(d) for d in AGENTS[n].depends_on]
            deps = [d for d in deps if d]
            tid = self.tracer.queue(n, AGENTS[n].label + self.suffix, AGENTS[n].description, depends_on=deps,
                                    initiated_by=initiated_by)
            self.task_of[n] = tid
            pending[n] = tid
        done: set[str] = set()
        while pending:
            ready = [n for n in pending
                     if all((d not in pending) for d in AGENTS[n].depends_on)]
            if not ready:  # should not happen: report instead of looping forever
                for n, tid in pending.items():
                    self.tracer.fail(tid, "Dependencies could not be resolved.")
                break
            blocked = [n for n in ready if any(d in names and d not in self.bb.results and d not in AGENTS[n].soft_depends
                                               for d in AGENTS[n].depends_on)]
            for n in blocked:
                self.tracer.fail(pending.pop(n), "An agent it depends on failed, so it could not run.")
            ready = [n for n in ready if n not in blocked]
            if len(ready) == 1:
                self._run_one(ready[0], pending[ready[0]])
            elif ready:
                with ThreadPoolExecutor(max_workers=min(6, len(ready))) as pool:
                    list(pool.map(lambda n: self._run_one(n, pending[n]), ready))
            for n in ready:
                pending.pop(n, None)
                done.add(n)

    def validate(self, round_: int) -> dict | None:
        self.bb.hints["summaries"] = self.summaries
        self.bb.hints["issues"] = self.issues
        self.bb.results.pop("validation", None)
        self.task_of.pop("validation", None)
        self.run(["validation"])
        return self.bb.results.get("validation")


def _dependents(name: str, among: set[str]) -> list[str]:
    out = []
    for n in AGENTS:
        if n in among and name in AGENTS[n].depends_on:
            out.append(n)
    return out


def compose(bb: Blackboard, intent: str) -> str:
    """One coordinated answer, written from the agents' results (no model needed)."""
    r = bb.results
    plan = (r.get("itinerary") or {}).get("plan")
    if not plan:
        sug = (r.get("research") or {}).get("suggestions") or []
        names = ", ".join(s["name"] for s in sug)
        return ("Where would you like to go? " + (f"For your dates and interests, consider {names}." if names else ""))
    lines = [f"**{plan['title']}**: {len(plan['days'])} days. {plan['summary']}"]
    b = r.get("budget")
    if b:
        lines.append(f"Estimated cost: {rs(b['total'])} ({rs(b['per_person'])} per person), an estimate, not a quote. "
                     + (b["comparison"].get("message") or ""))
    w = r.get("weather")
    if w:
        lines.append(("Weather: " + (f"forecast for {len(w['day_weather'])} days, {len(w['impacts'])} with risks."
                                     if w.get("day_weather") else (w.get("reason") or "no forecast for these dates."))))
    s = r.get("safety")
    if s:
        o = s["overall"]
        lines.append(f"Risk: {o['category']} ({o['score']}/100, heuristic, confidence {s['confidence']}). {o['action']}")
    e = r.get("eco")
    if e:
        c = e["current"]
        lines.append(f"Transport emissions: about {c['kg_co2e'][0]:,}–{c['kg_co2e'][1]:,} kg CO2e (estimate); "
                     f"lowest option: {e['lowest']}.")
    p = r.get("packing")
    if p:
        lines.append(f"Packing list: {len(p['items'])} items, based on {p['basis']}.")
    v = r.get("validation") or {}
    for d in v.get("decisions", []):
        lines.append(f"Your decision needed: {d['message']}")
    lines.append("Road status: current road status could not be verified. Check NHMP (130) on the morning you travel.")
    return "\n\n".join(lines)


def _narrate(bb: Blackboard, tracer: Tracer, tid: str, fallback: str) -> tuple[str, str]:
    """Optional: one model call to phrase the answer. Facts still come only from the agents."""
    if not config.llm_enabled():
        return fallback, "rules"
    from agent import llm
    started = time.monotonic()
    try:
        resp = llm.complete([
            {"role": "system", "content": "Rewrite the travel summary below for the traveller in plain, warm English "
             "(at most 140 words). Keep every number, warning and caveat exactly. Add no facts, places, prices or "
             "claims. Never say a road is open or anything is booked."},
            {"role": "user", "content": fallback}], None, time.monotonic() + 20)
        text = (resp["message"].get("content") or "").strip()
        tracer.tool(tid, f"llm.summarize({resp['model']})", bool(text), int((time.monotonic() - started) * 1000))
        if text and FORBIDDEN.search(text):
            tracer.note("The model's wording made a claim Raahi can't support, so the rule-based summary was kept.")
        elif text and all(n in text for n in re.findall(r"\d[\d,]{3,}", fallback)):
            return text, "ai"
        else:
            tracer.note("The model's wording dropped or changed figures, so the rule-based summary was kept.")
    except Exception as exc:
        tracer.tool(tid, "llm.summarize", False, int((time.monotonic() - started) * 1000), str(exc)[:160])
    return fallback, "rules"


def twin_baseline(bb: Blackboard, assumed: list[str]) -> dict | None:
    r = bb.results
    plan = (r.get("itinerary") or {}).get("plan")
    if not plan:
        return None
    from twin.comparison import summarize
    return {"id": uuid.uuid4().hex[:12], "created_at": http.now_iso(), "request": plan["request"],
            "summary": summarize(plan, r.get("safety"), r.get("eco")), "assumed": assumed,
            "data_reviewed": plan.get("data_reviewed")}


def orchestrate(message: str = "", state: dict | None = None, intent: str | None = None, memory: dict | None = None,
                emit=None, kind: str = "plan") -> dict:
    tracer = Tracer(kind=kind, emit=emit)
    bb = Blackboard(message=message or "", state=TripState.model_validate(state) if state else TripState(),
                    memory=memory or {}, deadline=time.monotonic() + config.AGENT_DEADLINE_S)
    orch = tracer.queue("orchestrator", "Master Orchestrator", "Understand the request, delegate, validate, answer",
                        initiated_by="user")
    tracer.start(orch, {"message": (message or "")[:200], "intent": intent})
    runner = Runner(bb, tracer)
    runner.run(["memory"])
    if "memory" not in bb.results:
        tracer.fail(orch, "Could not read the request.")
        return _result(bb, tracer, intent or "plan", None, [], "Sorry, I couldn't read that request.", "rules")
    intent = detect_intent(message, intent)
    st = bb.state
    assumed: list[str] = []
    if not st.destinations:
        tracer.tool(orch, "plan.tasks", True, 0, "No destination yet: research only, then ask")
        runner.run(["research"])
        answer = compose(bb, intent)
        tracer.finish(orch, {"intent": intent, "agents": ["memory", "research"]}, "Asked where to go",
                      status="waiting_for_approval")
        return _result(bb, tracer, intent, None, [], answer, "rules")
    req, assumed = st.to_request()
    bb.request = req
    names = INTENT_AGENTS[intent]
    tracer.tool(orch, "plan.tasks", True, 0, f"Intent '{intent}': {', '.join(names)}")
    runner.run(names)
    v = runner.validate(1) if "itinerary" in names else None
    if v and v.get("retry_requests"):
        for rq in v["retry_requests"][:2]:
            bb.hints.update(rq.get("hint") or {})
            again = [rq["agent"], *_dependents(rq["agent"], set(names))]
            for n in again:
                bb.results.pop(n, None)
                runner.task_of.pop(n, None)
            runner.run(again, initiated_by=runner.task_of.get("validation") or "validation")
        v = runner.validate(2)
    fallback = compose(bb, intent)
    answer, mode = _narrate(bb, tracer, orch, fallback)
    st_after = bb.state.absorb(req) if (bb.results.get("itinerary") or {}).get("plan") else bb.state
    bb.state = st_after
    status = "waiting_for_approval" if v and v.get("decisions") else "completed"
    tracer.finish(orch, {"intent": intent, "agents": names, "verdict": (v or {}).get("verdict")},
                  "Coordinated the agents and returned one validated answer", status=status)
    return _result(bb, tracer, intent, twin_baseline(bb, assumed), assumed, answer, mode)


def _result(bb, tracer, intent, twin, assumed, answer, mode) -> dict:
    r = bb.results
    return {"answer": answer, "answer_mode": mode, "intent": intent,
            "state": bb.state.model_dump(mode="json") if bb.state else None,
            "missing": bb.state.missing() if bb.state else [], "assumed": assumed,
            "plan": (r.get("itinerary") or {}).get("plan"),
            "agents": {k: v for k, v in r.items() if k != "itinerary"},
            "itinerary_alternatives": (r.get("itinerary") or {}).get("alternatives", []),
            "validation": r.get("validation"), "twin": twin, "run": tracer.summary()}
