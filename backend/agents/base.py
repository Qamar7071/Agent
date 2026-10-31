"""Shared pieces for Raahi's specialist agents.

- `Tracer` records real execution events (queued, running, tool calls, retries, completed,
  failed, waiting for approval) with timestamps. The Agent Control Center shows exactly these.
- `Blackboard` is the shared workspace of one run: the trip request, closures, scenario
  overlays and each agent's output. Agents read what they depend on and write their own result.
- `Agent` is the base class: a name, what it depends on, and `run()`. `tool()` wraps every
  external call so it is timed, logged in the trace and retried a limited number of times.

Agents are plain Python classes that call deterministic code and live services. None of them
invents data: when a source fails, the result says so.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

log = logging.getLogger("raahi.agents")

STATUSES = ("idle", "queued", "running", "completed", "failed", "retrying", "waiting_for_approval", "skipped")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Tracer:
    """Collects execution events for one run. Thread-safe; can forward each event as it happens."""

    def __init__(self, run_id: str | None = None, kind: str = "plan", emit: Callable[[dict], None] | None = None):
        self.run_id = run_id or uuid.uuid4().hex[:12]
        self.kind = kind
        self.started_at = _now()
        self._t0 = time.monotonic()
        self.tasks: dict[str, dict] = {}
        self.events: list[dict] = []
        self.edges: list[dict] = []
        self.messages: list[dict] = []
        self._emit = emit
        self._lock = threading.Lock()

    def _event(self, tid: str | None, kind: str, **extra) -> None:
        ev = {"t": _now(), "ms": int((time.monotonic() - self._t0) * 1000), "task": tid, "type": kind, **extra}
        with self._lock:
            self.events.append(ev)
            task = self.tasks.get(tid) if tid else None
            snapshot = dict(task) if task else None
        if self._emit:
            try:
                self._emit({"type": "event", "event": ev, "task": snapshot})
            except Exception:  # a disconnected client must not break the run
                log.debug("event emit failed", exc_info=True)

    def queue(self, agent: str, label: str, task: str, *, depends_on: list[str] | None = None,
              initiated_by: str = "orchestrator") -> str:
        tid = f"{agent}-{len(self.tasks) + 1}"
        with self._lock:
            self.tasks[tid] = {"id": tid, "agent": agent, "label": label, "task": task, "status": "queued",
                               "depends_on": list(depends_on or []), "initiated_by": initiated_by,
                               "queued_at": _now(), "started_at": None, "ended_at": None, "duration_ms": None,
                               "inputs": None, "outputs": None, "contribution": None, "tool_calls": [],
                               "errors": [], "retries": 0, "note": None}
            for dep in depends_on or []:
                self.edges.append({"from": dep, "to": tid, "kind": "data"})
            if initiated_by not in ("orchestrator", "user"):
                self.edges.append({"from": initiated_by, "to": tid, "kind": "request"})
        self._event(tid, "queued")
        return tid

    def start(self, tid: str, inputs: dict | None = None) -> None:
        with self._lock:
            t = self.tasks[tid]
            t.update(status="running", started_at=t["started_at"] or _now(), inputs=inputs)
            t["_t"] = time.monotonic()
        self._event(tid, "running")

    def resume(self, tid: str) -> None:
        with self._lock:
            self.tasks[tid]["status"] = "running"
        self._event(tid, "running")

    def tool(self, tid: str, name: str, ok: bool, ms: int, detail: str = "") -> None:
        call = {"name": name, "ok": ok, "ms": ms, "detail": detail[:240], "t": _now()}
        with self._lock:
            self.tasks[tid]["tool_calls"].append(call)
        self._event(tid, "tool", tool=call)

    def retry(self, tid: str, reason: str) -> None:
        with self._lock:
            t = self.tasks[tid]
            t["retries"] += 1
            t["status"] = "retrying"
            t["errors"].append(reason[:240])
        self._event(tid, "retrying", reason=reason[:240])

    def _close(self, tid: str, status: str, **upd) -> None:
        with self._lock:
            t = self.tasks[tid]
            started = t.pop("_t", None)
            t.update(status=status, ended_at=_now(), **upd)
            if started is not None:
                t["duration_ms"] = int((time.monotonic() - started) * 1000)

    def finish(self, tid: str, outputs: dict | None, contribution: str, status: str = "completed") -> None:
        self._close(tid, status, outputs=outputs, contribution=contribution)
        self._event(tid, status)

    def fail(self, tid: str, error: str) -> None:
        with self._lock:
            self.tasks[tid]["errors"].append(error[:240])
        self._close(tid, "failed", contribution=None)
        self._event(tid, "failed", error=error[:240])

    def skip(self, agent: str, label: str, task: str, reason: str) -> str:
        tid = f"{agent}-{len(self.tasks) + 1}"
        with self._lock:
            self.tasks[tid] = {"id": tid, "agent": agent, "label": label, "task": task, "status": "skipped",
                               "depends_on": [], "initiated_by": "orchestrator", "queued_at": _now(),
                               "started_at": None, "ended_at": None, "duration_ms": None, "inputs": None,
                               "outputs": None, "contribution": None, "tool_calls": [], "errors": [], "retries": 0,
                               "note": reason}
        self._event(tid, "skipped", reason=reason)
        return tid

    def note(self, message: str, **extra) -> None:
        self._event(None, "note", message=message, **extra)

    def say(self, tid: str, kind: str, summary: str, *, reason: str | None = None,
            evidence: list[dict] | None = None, resolves: str | None = None) -> str:
        """An agent's message in the "how the agents decided" conversation.

        kind is proposal, concern or decision. Every message belongs to a real task (step) of
        this run and carries the evidence it is based on ({source, detail}); `resolves` points
        to an earlier message it answers. Messages are written from results, never scripted.
        """
        assert kind in ("proposal", "concern", "decision")
        with self._lock:
            agent = self.tasks[tid]["agent"] if tid in self.tasks else "orchestrator"
            mid = f"m{len(self.messages) + 1}"
            msg = {"id": mid, "runId": self.run_id, "step": tid, "agent": agent, "type": kind,
                   "summary": summary[:400], "reason": (reason or "")[:400] or None,
                   "evidence": [{"source": str(e.get("source", ""))[:80], "detail": str(e.get("detail", ""))[:200]}
                                for e in (evidence or [])][:4],
                   "resolvesEventId": resolves, "t": _now()}
            self.messages.append(msg)
        self._event(tid, "message", message=msg)
        return mid

    def summary(self) -> dict:
        with self._lock:
            tasks = [{k: v for k, v in t.items() if not k.startswith("_")} for t in self.tasks.values()]
            return {"id": self.run_id, "kind": self.kind, "started_at": self.started_at, "ended_at": _now(),
                    "duration_ms": int((time.monotonic() - self._t0) * 1000), "tasks": tasks,
                    "edges": list(self.edges), "events": list(self.events), "messages": list(self.messages)}


@dataclass
class Blackboard:
    """What one run knows. Agents read their inputs from here and write their results back."""
    request: Any = None                       # schemas.TripRequest
    state: Any = None                         # schemas.TripState
    message: str = ""
    closures: frozenset = frozenset()         # road legs treated as closed (Travel Twin scenarios)
    scenario: dict | None = None              # active what-if scenario, if any
    memory: dict = field(default_factory=dict)
    results: dict[str, Any] = field(default_factory=dict)
    deadline: float = field(default_factory=lambda: time.monotonic() + 45)
    hints: dict[str, Any] = field(default_factory=dict)     # requests from other agents (e.g. validation)

    def get(self, agent: str, default=None):
        return self.results.get(agent, default)


@dataclass
class AgentResult:
    ok: bool
    data: dict
    summary: str                    # one line: what this agent contributed
    confidence: str = "medium"      # high | medium | low
    sources: list = field(default_factory=list)
    issues: list = field(default_factory=list)
    status: str = "completed"       # or waiting_for_approval


class AgentError(RuntimeError):
    pass


class Agent:
    name = "agent"
    label = "Agent"
    description = ""
    depends_on: tuple[str, ...] = ()
    soft_depends: tuple[str, ...] = ()   # used if available; their failure does not block this agent
    max_retries = 1

    def run(self, bb: Blackboard, tracer: Tracer, tid: str) -> AgentResult:  # pragma: no cover - interface
        raise NotImplementedError

    def tool(self, tracer: Tracer, tid: str, name: str, fn: Callable, *args, ok_when: Callable[[Any], bool] | None = None,
             retries: int = 0, **kwargs):
        """Call a tool (a service or deterministic engine), time it and record it in the trace.

        `ok_when` decides whether the result counts as a success (e.g. a weather result with
        available=False is a failed call). Failed calls are retried up to `retries` times.
        """
        attempt = 0
        while True:
            started = time.monotonic()
            try:
                out = fn(*args, **kwargs)
                ok = ok_when(out) if ok_when else True
                detail = "" if ok else str((out or {}).get("reason") or (out or {}).get("error") or "unavailable")
            except Exception as exc:
                out, ok, detail = None, False, f"{type(exc).__name__}: {exc}"
            tracer.tool(tid, name, ok, int((time.monotonic() - started) * 1000), detail)
            if ok or attempt >= retries:
                if out is None and not ok:
                    raise AgentError(detail)
                return out
            attempt += 1
            tracer.retry(tid, f"{name} failed ({detail[:120]}); retrying")
            time.sleep(0.3 * attempt)
            tracer.resume(tid)
