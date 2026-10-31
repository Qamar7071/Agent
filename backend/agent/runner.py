"""The agent loop: model ↔ tools, bounded by steps, tool calls, tokens and a deadline.

1. Read the message deterministically and update the structured trip state (memory).
2. If an AI provider is configured: let the model plan and call tools (validated, logged
   in a trace) until it answers, the limits are reached, or the deadline passes.
3. Otherwise, or if the model fails before doing anything: answer in guided mode with
   the same tools.
4. Return the reply plus the structured results (itinerary, forecasts, road status,
   enquiry draft) taken from the tools themselves, never from the model's prose.
"""
import json
import logging
import re
import time

import config
from agent import guided, llm, parser, prompt, tools
from schemas import ChatRequest, TripState

log = logging.getLogger("raahi.agent")
HISTORY_TURNS = 12
HISTORY_CHARS = 1500

# Claims Raahi can never support. A match that follows a negation in the same sentence
# ("I can't say the road is open") is fine; anything else sends the turn to guided mode.
UNSUPPORTED = [
    re.compile(r"\b(road|roads|highway|kkh|pass|route|track)\b[^.!?\n]{0,60}?\b(is|are)\s+(now\s+|currently\s+|fully\s+)?"
               r"(open|clear|passable|safe to (drive|travel))\b", re.I),
    re.compile(r"\b(booking|reservation|room|seat|ticket)s?\b[^.!?\n]{0,30}?\b(is|are|has been|have been)\s+"
               r"(confirmed|booked|reserved)\b", re.I),
    re.compile(r"\b(i|we)('ve| have)?\s+(booked|reserved|confirmed)\b", re.I),
    re.compile(r"\bguaranteed\s+(availability|price|seat|room|safe)", re.I),
]
ROAD_TOPIC = re.compile(r"\b(road|roads|kkh|karakoram|highway|landslides?|sarak|sadak|rasta|raasta|pass|route)\b", re.I)
NEGATION = re.compile(r"\b(not|n't|cannot|never|no|unable|can't|couldn't|unverified|without)\b", re.I)
# Typical-pattern statements ("usually open April to November") are allowed: they are seasonal, not live.
SEASONAL = re.compile(r"\b(usually|typically|normally|generally|seasonal(ly)?|season|months?|january|february|march|"
                      r"april|may|june|july|august|september|october|november|december)\b", re.I)


def unsupported_claim(text: str) -> str | None:
    """Return the first claim Raahi cannot support, unless the sentence negates it."""
    for pattern in UNSUPPORTED:
        for m in pattern.finditer(text or ""):
            start = max(text.rfind(".", 0, m.start()), text.rfind("\n", 0, m.start())) + 1
            end = min([i for i in (text.find(".", m.end()), text.find("\n", m.end())) if i >= 0] or [len(text)])
            sentence = text[start:end]
            if NEGATION.search(text[start:m.end()]) or (pattern is UNSUPPORTED[0] and SEASONAL.search(sentence)):
                continue
            return m.group(0)
    return None


def _text(content) -> str:
    if isinstance(content, list):          # some providers return content parts
        return "".join(p.get("text", "") for p in content if isinstance(p, dict)).strip()
    return (content or "").strip()


def prefetch(message: str, ctx: tools.ToolContext) -> list[tuple[str, dict]]:
    """Tool calls the server makes before the model answers, so facts never depend on the model
    choosing to look them up: road questions get the road tool, weather questions the forecast,
    and a new trip with a place and a length gets its itinerary."""
    found = parser.intents(message)
    st = ctx.state
    calls: list[tuple[str, dict]] = []
    if "road" in found and ROAD_TOPIC.search(message):     # not "is the restaurant open"
        calls.append(("get_road_status", {}))
    if "weather" in found:
        for d in st.destinations[:2]:
            args = {"destination": d}
            if st.start_date:
                args["start_date"] = st.start_date.isoformat()
            calls.append(("get_weather_forecast", args))
    if "plan" in found and st.destinations and (st.days or st.start_date) and not st.plan() \
            and not found & {"weather", "road", "stays", "food"}:
        calls.append(("create_itinerary", {}))
    return calls


def _ai(body: ChatRequest, ctx: tools.ToolContext, deadline: float) -> tuple[str, str, str]:
    messages = [{"role": "system", "content": prompt.SYSTEM}, {"role": "system", "content": prompt.context(ctx)}]
    for turn in body.history[-HISTORY_TURNS:]:
        messages.append({"role": turn.role, "content": turn.content[:HISTORY_CHARS]})
    messages.append({"role": "user", "content": body.message})

    provider = model = None
    used = 0
    pre = prefetch(body.message, ctx)
    if pre:
        calls = [{"id": f"raahi-{i}", "type": "function", "function": {"name": n, "arguments": json.dumps(a)}}
                 for i, (n, a) in enumerate(pre)]
        messages.append({"role": "assistant", "content": None, "tool_calls": calls})
        for call in calls:
            result = tools.execute(call["function"]["name"], call["function"]["arguments"], ctx)
            used += 1
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": tools.to_json(result)})
    for _step in range(config.AGENT_MAX_STEPS):
        allow_tools = used < config.AGENT_MAX_TOOL_CALLS
        try:
            resp = llm.complete(messages, tools.SCHEMAS if allow_tools else None, deadline, prefer=provider)
        except llm.LLMUnavailable:
            if provider is None:
                raise                          # nothing done yet: let guided mode answer
            break                              # tools already ran: summarise what they found
        provider, model = resp["provider"], resp["model"]
        msg = resp["message"]
        calls = msg.get("tool_calls") or []
        if not calls:
            text = _text(msg.get("content"))
            if text:
                return text, provider, model
            break
        messages.append(msg)
        for call in calls:
            fn = call.get("function") or {}
            if used >= config.AGENT_MAX_TOOL_CALLS:
                result = {"ok": False, "error": "Tool limit reached for this message. Answer with what you have."}
            else:
                result = tools.execute(fn.get("name", ""), fn.get("arguments") or "{}", ctx)
                used += 1
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": tools.to_json(result)})
    fallback = guided.summary_of(ctx) or ("Sorry, I ran out of time before I could finish. Please ask again, or "
                                          "use the planner form.")
    return fallback, provider, model


def _suggestions(state: TripState, artifacts: dict) -> list[str]:
    if state.has_itinerary or artifacts.get("itinerary"):
        out = ["Weather for my trip", "Road status", "Make it cheaper", "More relaxed pace", "Save this trip",
               "Help me book"]
        return out[:5]
    missing = state.missing()
    if "destinations" in missing:
        return ["Hunza and Attabad in spring", "Skardu and Deosai in July", "Suggest a 5-day trip", "Weather in Hunza"]
    if "dates" in missing or "days" in missing:
        return ["6 days in May", "A week from 10 June", "Next month, 5 days"]
    if "travellers" in missing:
        return ["Just me", "2 adults", "2 adults and 2 kids"]
    if "budget" in missing:
        return ["Budget Rs 1,50,000 total", "Rs 60,000 per person", "No fixed budget"]
    return ["Plan it", "Weather for my trip"]


def run_chat(body: ChatRequest) -> dict:
    started = time.monotonic()
    deadline = started + config.AGENT_DEADLINE_S
    slots = parser.extract(body.message)
    state = parser.merge(body.state or TripState(), slots)
    ctx = tools.ToolContext(state, body.trip)

    mode, provider, model, notice, ai_error = "guided", None, None, None, None
    reply = None
    if config.llm_enabled():
        try:
            reply, provider, model = _ai(body, ctx, deadline)
            mode = "ai"
            claim = unsupported_claim(reply)
            if claim:
                log.warning("AI reply rejected for an unsupported claim: %r", claim)
                ctx.trace.append({"tool": "honesty_check", "ok": False, "ms": 0,
                                  "summary": f"Rejected the AI wording for an unsupported claim: “{claim}”"})
                reply, mode = None, "guided"
                notice = "The AI's wording made a claim Raahi can't support, so Raahi answered in guided mode."
        except llm.LLMUnavailable as exc:
            notice = "The AI model did not respond, so Raahi answered in guided mode."
            ai_error = str(exc)[:600]
    else:
        notice = "AI model not configured on this server: guided mode."
    if reply is None:
        reply = guided.respond(body.message, slots, ctx)

    a = ctx.artifacts
    return {
        "reply": reply,
        "mode": mode,
        "provider": provider,
        "model": model,
        "notice": notice,
        "ai_error": ai_error,
        "state": ctx.state.model_dump(mode="json"),
        "missing": ctx.state.missing(),
        "itinerary": a.get("itinerary"),
        "weather": a.get("weather"),
        "alerts": a.get("alerts"),
        "roads": a.get("roads"),
        "route": a.get("route"),
        "places": a.get("places"),
        "budget": a.get("budget") if not a.get("itinerary") else None,
        "enquiry_draft": a.get("enquiry_draft"),
        "client_actions": ctx.client_actions,
        "trace": ctx.trace,
        "suggestions": _suggestions(ctx.state, a),
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }
