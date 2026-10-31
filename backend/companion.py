"""Safar Saathi: optional AI wording for the trip companion's nudges.

The nudge itself (rule, numbers, options) is decided on the phone by deterministic code. This
only asks the model to make the sentence sound friendlier in the traveller's language. The
reworded text is used only if it keeps exactly the same numbers, makes no claim Raahi can't
support and is in the right script; otherwise the rule-based text is returned unchanged.
"""
import logging
import re
import time

import config
from agent import llm
from agent.runner import unsupported_claim

log = logging.getLogger("raahi.companion")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
URDU_SCRIPT = re.compile(r"[؀-ۿ]")
LANGUAGE = {
    "en": "simple, warm English",
    "ur": "Roman Urdu: Urdu written in Latin letters, the way friends text (for example \"Kal ke liye 2 option\"). "
          "Never use Urdu script",
}


def _numbers(text: str) -> list[str]:
    return sorted(n.replace(",", "") for n in NUMBER.findall(text))


def reword(text: str, language: str) -> dict:
    template = {"text": text, "mode": "template"}
    if not config.llm_enabled():
        return {**template, "reason": "AI not configured"}
    messages = [
        {"role": "system", "content": (
            f"You reword one budget note for a group on a trip in Northern Pakistan. Write it in {LANGUAGE[language]}. "
            "Make it personal and friendly, at most two short sentences, no emojis, no greeting beyond the name if "
            "one is given. Keep every number exactly as written (amounts, percentages, day numbers). Add no facts, "
            "prices, places or advice. Never say anything is booked or that a road is open. Reply with the text only.")},
        {"role": "user", "content": text},
    ]
    started = time.monotonic()
    try:
        resp = llm.complete(messages, None, started + 12)
    except llm.LLMUnavailable as exc:
        log.info("Nudge wording fell back to the template: %s", str(exc)[:160])
        return {**template, "reason": "AI unavailable"}
    out = (resp["message"].get("content") or "").strip().strip('"').strip()
    if not out or len(out) > 420:
        return {**template, "reason": "AI reply empty or too long"}
    if _numbers(out) != _numbers(text):
        return {**template, "reason": "AI changed the numbers"}
    if unsupported_claim(out):
        return {**template, "reason": "AI made an unsupported claim"}
    if language == "ur" and URDU_SCRIPT.search(out):
        return {**template, "reason": "AI used Urdu script"}
    return {"text": out, "mode": "ai", "model": resp["model"]}
