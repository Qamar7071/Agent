"""Request guards: client identification, rate limiting and admin authentication.

The rate limiter is in memory. On a single server (Render, local) it is exact; on
serverless hosts each warm instance keeps its own counters, so it is a best-effort brake
rather than a hard quota (documented in the README).
"""
import hmac
import threading
import time
from collections import deque

from flask import request

import config


def client_ip() -> str:
    """The caller's address. Proxy headers are trusted only behind a known proxy (Vercel/Render)."""
    if config.TRUST_PROXY:
        fwd = request.headers.get("X-Forwarded-For", "")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
        real = request.headers.get("X-Real-IP")
        if real:
            return real.strip()[:64]
    return (request.remote_addr or "unknown")[:64]


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = {}
        self._lock = threading.Lock()

    def check(self, bucket: str, key: str, limit: int, window_s: float = 60.0) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, seconds_until_retry)."""
        if limit <= 0:
            return True, 0
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault((bucket, key), deque())
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                return False, max(1, int(q[0] + window_s - now) + 1)
            q.append(now)
            if len(self._hits) > 20000:          # keep memory bounded
                for k in [k for k, v in self._hits.items() if not v][:10000]:
                    self._hits.pop(k, None)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def admin_status() -> str:
    """'ok', 'disabled' (no ADMIN_TOKEN configured) or 'denied'."""
    if not config.ADMIN_TOKEN:
        return "disabled"
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    return "ok" if token and hmac.compare_digest(token, config.ADMIN_TOKEN) else "denied"
