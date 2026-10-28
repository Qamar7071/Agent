"""Shared HTTP helpers: one User-Agent, short timeouts, and a tiny in-memory TTL cache.

On serverless hosts the cache lives only as long as the warm instance, which is fine:
it only exists to avoid hammering free public APIs.
"""
import threading
import time
from datetime import datetime, timezone

import requests

import config

UA = f"Raahi/2.0 (AI travel concierge for Northern Pakistan; {config.CONTACT})"
_session = requests.Session()
_session.headers.update({"User-Agent": UA, "Accept": "application/json, application/xml;q=0.9, */*;q=0.5"})

_cache: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get(url: str, **kw) -> requests.Response:
    kw.setdefault("timeout", config.HTTP_TIMEOUT_S)
    r = _session.get(url, **kw)
    r.raise_for_status()
    return r


def post(url: str, **kw) -> requests.Response:
    kw.setdefault("timeout", config.HTTP_TIMEOUT_S)
    r = _session.post(url, **kw)
    r.raise_for_status()
    return r


def cached(key: str, ttl_s: float, fetch):
    """Return a cached value or call fetch(). Failures (available=False) are cached briefly."""
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = fetch()
    ok = not (isinstance(value, dict) and value.get("available") is False)
    with _lock:
        _cache[key] = (now + (ttl_s if ok else min(60, ttl_s)), value)
    return value


def clear_cache() -> None:
    with _lock:
        _cache.clear()
