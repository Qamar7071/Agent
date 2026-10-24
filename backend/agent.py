"""The Raahi agent: turns the user's message into a thinking, adaptive reply using an
LLM (any OpenAI-compatible API), grounded with live weather and the curated guide.

Config via environment (never hard-code keys):
    LLM_API_KEY   your key (OpenAI, OpenRouter, Groq, Together, Gemini-compat, …)
    LLM_BASE_URL  default https://api.openai.com/v1
    LLM_MODEL     default gpt-4o-mini

Without a key, chat() falls back to a friendly rule-based reply and /api/plan still
works fully (the planner is deterministic).
"""
import json
import logging
import os

import requests

from data import DESTINATIONS, LEGS, SEASON_NOTES, season_of
from tools import match_destinations, weather_summary_for, build_plan
from datetime import date

API_KEY = os.environ.get("LLM_API_KEY", "").strip()
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You are Raahi, an expert, friendly travel concierge for Northern Pakistan (Gilgit-Baltistan): Skardu, Hunza, Attabad, Fairy Meadows, Deosai, Passu, Khunjerab and the K2/Baltoro trek.

HOW YOU THINK
- Flipped interaction: do NOT dump a full plan immediately. Ask at most 2 short, specific questions when missing details would change the recommendation. Check the conversation first; don't re-ask details already given. For a useful plan, establish dates/month, starting city, group size, budget and preferred pace, but don't make the user answer everything before giving useful guidance.
- Adaptation: match the user. Beginners get simple, reassuring guidance; experienced trekkers get logistics detail. Mirror their language (English / Urdu / Roman Urdu). Use the conversation history; never re-ask what they already told you.
- Situation-aware: use CURRENT_CONTEXT and the travel dates the user gave. Distinguish a forecast from a guarantee. Deosai and Khunjerab are seasonal high-altitude routes; in winter they are generally inaccessible, and exact opening dates must be confirmed locally. Fairy Meadows and K2/Baltoro involve demanding trekking logistics; never present them as casual roadside stops.
- Realistic logistics: Northern Pakistan drives are slow and vulnerable to weather, road works and closures. The Islamabad–Hunza road journey needs substantial transfer time and an overnight stop; a five-day round trip leaves very little time in Hunza, so state that trade-off rather than presenting it as a relaxed holiday. Preserve sensible transfer/overnight time, acclimatisation and buffer time; do not cram distant regions into a short trip or promise a connection/flight. When the available details are insufficient, explain the trade-off and ask before committing to a route.

HONESTY (critical)
- Never invent live weather, road/KKH status, hotel availability, fees, travel times or exact prices. Only call weather live when CURRENT_CONTEXT contains a current forecast; it is not a road-condition report. For costs, distinguish estimates from live quotes and state the assumptions; for road status and seasonal access, tell the traveller to verify with official/local sources before departure.
- Do not claim a booking, route check, price check or external action was completed. If a fact is not in CURRENT_CONTEXT or the curated guide, say you cannot verify it instead of guessing.
- Asking for exact dates helps assess seasonality only; never imply you can check future or live road conditions. Direct the traveller to official/local updates for the actual status.
- Respect altitude safety (Khunjerab 4,693 m, Deosai 4,100 m, K2 BC 5,150 m).

OUTPUT — reply with ONLY a JSON object, no markdown fences:
{
  "reply": "your message — questions, advice, or a plan summary (markdown allowed inside the string)",
  "destinations": ["hunza","skardu"],            // ids you are talking about, optional
  "itinerary": {                                  // ONLY once you have enough info to plan
     "title": "",
     "days": [ {"day":1,"title":"","location":"Hunza","activities":["..."]} ]
  },
  "actions": [ {"label":"Open trip planner","type":"planner","value":{"destinations":["hunza"]}} ]  // optional
}
Valid destination ids: hunza, skardu, attabad, fairy-meadows, deosai, passu, khunjerab, k2.
Keep "reply" concise and warm. Omit "itinerary" while you are still asking questions."""


def _context(ids: list[str]) -> str:
    month = date.today().month
    parts = [f"Today is {date.today().isoformat()}. Current season: {season_of(month)} — {SEASON_NOTES[season_of(month)]}"]
    focus = ids or ["hunza", "skardu", "fairy-meadows", "deosai"]
    for did in focus[:4]:
        d = DESTINATIONS.get(did)
        if d:
            parts.append(f"{d['name']} ({d['altitude']} m) — {d['tagline']}. Best months {d['best_months'][0]}–{d['best_months'][-1]}. {d['access']}")
    if any(did in ids for did in ("hunza", "attabad", "passu", "khunjerab")):
        stages = []
        for key, label in (
            ("islamabad>chilas", "Islamabad–Chilas"),
            ("chilas>gilgit", "Chilas–Gilgit"),
            ("gilgit>hunza", "Gilgit–Hunza"),
        ):
            if key in LEGS:
                km, hours, _ = LEGS[key]
                stages.append(f"{label}: {km} km, about {hours[0]}–{hours[1]} h")
        if stages:
            parts.append(
                "CURATED ROAD ESTIMATES (approximate, not live navigation): "
                + "; ".join(stages)
                + ". For a private-car Islamabad–Hunza round trip, plan roughly two travel days each way with an overnight stop, plus delay buffer; a five-day trip leaves very little time at the destination."
            )
    wx = weather_summary_for(focus)
    if wx:
        parts.append("LIVE WEATHER (from Open-Meteo, real):\n" + wx)
    return "\n".join(parts)


def _call_llm(messages: list[dict], want_json: bool = True) -> str:
    if not API_KEY:
        raise RuntimeError("no-key")
    url = f"{BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": MODEL, "messages": messages, "temperature": 0.6, "max_tokens": 1200}
    if want_json:
        payload["response_format"] = {"type": "json_object"}
    r = requests.post(url, headers=headers, json=payload, timeout=60)
    if r.status_code == 400 and want_json:  # provider may not support response_format
        payload.pop("response_format", None)
        r = requests.post(url, headers=headers, json=payload, timeout=60)
    if not r.ok:
        raise RuntimeError(
            f"LLM provider returned HTTP {r.status_code} for model {MODEL}. "
            "Check the provider URL, key, model name and account quota."
        )
    return r.json()["choices"][0]["message"]["content"]


def _log_llm_failure(error: Exception) -> None:
    logging.getLogger(__name__).warning(
        "LLM call failed; using grounded fallback. Reason: %s",
        ascii(str(error)),
    )


def _coerce(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{"):]
    try:
        obj = json.loads(raw)
    except Exception:
        return {"reply": raw}
    out = {"reply": obj.get("reply") or obj.get("response") or obj.get("answer") or ""}
    if isinstance(obj.get("destinations"), list):
        valid = [d for d in (x if isinstance(x, str) else "" for x in obj["destinations"]) if d in DESTINATIONS]
        if valid:
            out["destinations"] = valid
    if isinstance(obj.get("itinerary"), dict) and obj["itinerary"].get("days"):
        out["itinerary"] = obj["itinerary"]
    if isinstance(obj.get("actions"), list):
        out["actions"] = [a for a in obj["actions"] if isinstance(a, dict) and a.get("label")]
    return out


def chat(message: str, history: list[dict]) -> dict:
    recent = " ".join(m.get("content", "") for m in (history or [])[-4:]) + " " + message
    ids = match_destinations(recent)
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages += [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in (history or [])[-10:]]
        messages.append({"role": "system", "content": "CURRENT_CONTEXT:\n" + _context(ids)})
        messages.append({"role": "user", "content": message})
        result = _coerce(_call_llm(messages))
        result["ai_available"] = True
        return result
    except Exception as e:
        if "no-key" not in str(e):
            _log_llm_failure(e)
        result = _fallback(message, ids, str(e))
        result["ai_available"] = False
        return result


def _fallback(message: str, ids: list[str], err: str) -> dict:
    """No LLM key / LLM error — still useful: ask the flipped-interaction questions."""
    note = ""
    if "no-key" not in err:
        note = "_(AI service error — showing a quick guided reply.)_\n\n"
    names = ", ".join(DESTINATIONS[i]["name"] for i in ids) if ids else "Northern Pakistan"
    return {
        "reply": f"{note}Great — {names}! To tailor this properly, tell me:\n"
                 "1. **When** are you travelling (month or dates)?\n"
                 "2. **How many** travellers, and your **budget** in PKR?\n"
                 "3. **Pace** — relaxed sightseeing or serious trekking?\n\n"
                 "Share those and I’ll build a day-by-day route with distances, live weather and a cost estimate.",
        "destinations": ids or ["hunza", "skardu", "fairy-meadows"],
        "actions": [{"label": "Open trip planner", "type": "planner", "value": {"destinations": ids or ["hunza", "attabad"]}}],
    }


def plan(form: dict) -> dict:
    """Deterministic, grounded itinerary (always works). If an LLM key is present, it
    refines the summary to adapt to the traveller's interests — but the plan itself is
    computed, never hallucinated."""
    result = build_plan(form)
    if not result.get("days"):
        return {"itinerary": result}
    if API_KEY:
        try:
            interests = ", ".join(form.get("interests", [])) or "general sightseeing"
            ask = (
                "Rewrite ONLY the trip summary in 2 warm sentences for this traveller. "
                f"Interests: {interests}. Travellers: {form.get('travelers')}. Budget PKR {form.get('budget')}. "
                f"Route: {result['title']} over {len(result['days'])} days. Return plain text, no JSON."
            )
            txt = _call_llm([{"role": "system", "content": "You are Raahi, a concise travel writer."}, {"role": "user", "content": ask}], want_json=False)
            if txt and len(txt) < 400:
                result["summary"] = txt.strip()
        except Exception as e:
            _log_llm_failure(e)
    return {"itinerary": result}