"""The agent loop: model ↔ tools, bounded by steps, tool calls, tokens and a deadline.

1. Read the message deterministically and update the structured trip state (memory).
2. If an AI provider is configured: let the model plan and call tools (validated, logged
   in a trace) until it answers, the limits are reached, or the deadline passes.
3. Otherwise, or if the model fails before doing anything: answer in guided mode with
   the same tools.
4. Return the reply plus the structured results (itinerary, forecasts, road status,
   enquiry draft) taken from the tools themselves, never from the model's prose.
"""
import logging
import time

import config
from agent import guided, llm, parser, prompt, tools
from schemas import ChatRequest, TripState

log = logging.getLogger("raahi.agent")
HISTORY_TURNS = 12
HISTORY_CHARS = 1500


def _text(content) -> str:
    if isinstance(content, list):          # some providers return content parts
        return "".join(p.get("text", "") for p in content if isinstance(p, dict)).strip()
    return (content or "").strip()


def _ai(body: ChatRequest, ctx: tools.ToolContext, deadline: float) -> tuple[str, str, str]:
    messages = [{"role": "system", "content": prompt.SYSTEM}, {"role": "system", "content": prompt.context(ctx)}]
    for turn in body.history[-HISTORY_TURNS:]:
        messages.append({"role": turn.role, "content": turn.content[:HISTORY_CHARS]})
    messages.append({"role": "user", "content": body.message})

    provider = model = None
    used = 0
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
        return ["Budget PKR 150,000 total", "PKR 60,000 per person", "No fixed budget"]
    return ["Plan it", "Weather for my trip"]


def run_chat(body: ChatRequest) -> dict:
    started = time.monotonic()
    deadline = started + config.AGENT_DEADLINE_S
    slots = parser.extract(body.message)
    state = parser.merge(body.state or TripState(), slots)
    ctx = tools.ToolContext(state, body.trip)

    mode, provider, model, notice = "guided", None, None, None
    reply = None
    if config.llm_enabled():
        try:
            reply, provider, model = _ai(body, ctx, deadline)
            mode = "ai"
        except llm.LLMUnavailable:
            notice = "The AI model did not respond, so Raahi answered in guided mode."
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
        "state": ctx.state.model_dump(mode="json"),
        "missing": ctx.state.missing(),
        "itinerary": a.get("itinerary"),
        "weather": a.get("weather"),
        "alerts": a.get("alerts"),
        "roads": a.get("roads"),
        "route": a.get("route"),
        "budget": a.get("budget") if not a.get("itinerary") else None,
        "enquiry_draft": a.get("enquiry_draft"),
        "client_actions": ctx.client_actions,
        "trace": ctx.trace,
        "suggestions": _suggestions(ctx.state, a),
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }
