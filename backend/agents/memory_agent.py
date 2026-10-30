"""Memory Agent: the active trip's details, plus saved preferences only with consent.

Phase A keeps memory in the traveller's browser and sends it with each request; nothing is
stored on the server. Preferences fill only gaps the traveller has not stated, and memory from
another trip is ignored so trips never contaminate each other.
"""
from agent import parser
from agents.base import Agent, AgentResult
from schemas import TripState

PREF_FIELDS = ("origin", "transport", "accommodation", "pace", "interests", "food", "accessibility")


class MemoryAgent(Agent):
    name = "memory"
    label = "Memory"
    description = "Reads the request into the trip state, adds saved preferences (with consent) and keeps trips apart."

    def run(self, bb, tracer, tid):
        state = bb.state or TripState()
        slots = self.tool(tracer, tid, "parser.extract", parser.extract, bb.message) if bb.message else {}
        state = self.tool(tracer, tid, "state.merge", parser.merge, state, slots)

        applied, ignored = [], []
        mem = bb.memory or {}
        prefs = mem.get("preferences") or {}
        if prefs and not mem.get("consent"):
            ignored.append("saved preferences (no consent given)")
            prefs = {}
        if mem.get("trip_id") and mem.get("active_trip_id") and mem["trip_id"] != mem["active_trip_id"]:
            ignored.append("trip details from a different trip")
            mem = {**mem, "trip": None}
        upd = {}
        for key in PREF_FIELDS:
            current = getattr(state, key)
            if prefs.get(key) not in (None, "", []) and current in (None, "", []):
                upd[key] = prefs[key]
                applied.append(key)
        if upd:
            state = TripState.model_validate({**state.model_dump(), **upd})
        bb.state = state
        stated = sorted(k for k in slots if k not in ("night_range", "place_towns"))
        summary = (f"Understood {', '.join(stated) or 'no new details'}"
                   + (f"; applied saved preferences: {', '.join(applied)}" if applied else ""))
        return AgentResult(True, {"state": state.model_dump(mode="json"), "stated_now": stated,
                                  "applied_preferences": applied, "ignored": ignored, "missing": state.missing()},
                           summary, confidence="high")
