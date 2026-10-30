"""Chat-completions client for any OpenAI-compatible API (OpenAI, Groq, Gemini, OpenRouter…)
with tool calling, provider/model fallback and a hard deadline.

Keys stay on the server and are never logged; failures are logged by HTTP status and a short
error excerpt with anything that looks like a key removed.
"""
import json
import logging
import re
import time

import requests

import config

log = logging.getLogger("raahi.llm")
KEEP_FIELDS = ("role", "content", "tool_calls", "extra_content")   # extra_content: Gemini thought signatures


class LLMUnavailable(RuntimeError):
    pass


def _safe(text: str) -> str:
    """A short, key-free excerpt of a provider's error message, for diagnosis."""
    try:
        body = json.loads(text)
        err = body[0] if isinstance(body, list) else body
        msg = (err.get("error") or {}).get("message") if isinstance(err.get("error"), dict) else err.get("error")
        text = str(msg or text)
    except (ValueError, AttributeError, TypeError, IndexError):
        pass
    text = re.sub(r"\b(sk|gsk|AIza|tvly)[\w-]{4,}", "[key]", text or "")
    return re.sub(r"\s+", " ", text)[:160]


def complete(messages: list[dict], tools: list[dict] | None, deadline: float, prefer: str | None = None) -> dict:
    """One model turn. Tries the main provider's models, then the backup's (or only `prefer`).

    Returns {"message": {...}, "provider": name, "model": model, "usage": {...}}.
    """
    errors = []
    providers = [p for p in config.llm_providers() if prefer is None or p["name"] == prefer]
    if not providers:
        raise LLMUnavailable("No AI provider is configured.")
    for p in providers:
        for model in p["models"]:
            remaining = deadline - time.monotonic()
            if remaining < 4:
                raise LLMUnavailable("Out of time for this message.")
            payload = {"model": model, "messages": messages, "temperature": 0.3,
                       "max_tokens": config.LLM_MAX_TOKENS}
            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"
            try:
                r = requests.post(f"{p['base']}/chat/completions", json=payload,
                                  headers={"Authorization": f"Bearer {p['key']}", "Content-Type": "application/json"},
                                  timeout=min(config.LLM_TIMEOUT_S, remaining - 2))
            except requests.RequestException as exc:
                errors.append(f"{p['name']}/{model}: {type(exc).__name__}")
                continue
            if r.status_code == 200:
                try:
                    body = r.json()
                    msg = body["choices"][0]["message"]
                except (ValueError, KeyError, IndexError, TypeError):
                    errors.append(f"{p['name']}/{model}: unreadable response")
                    continue
                clean = {k: v for k, v in msg.items() if k in KEEP_FIELDS and v is not None}
                clean.setdefault("role", "assistant")
                for i, call in enumerate(clean.get("tool_calls") or []):
                    call.setdefault("id", f"call_{int(time.time() * 1000)}_{i}")
                    call.setdefault("type", "function")
                return {"message": clean, "provider": p["name"], "model": model, "usage": body.get("usage") or {}}
            errors.append(f"{p['name']}/{model}: HTTP {r.status_code} {_safe(r.text)}".strip())
            if r.status_code in (401, 403):
                break                      # bad key: this provider's other models will fail too
    log.warning("AI providers failed: %s", "; ".join(errors))
    raise LLMUnavailable("; ".join(errors))
