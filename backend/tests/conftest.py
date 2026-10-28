"""Shared test setup.

Every test runs offline: real network calls fail loudly, live services are switched off
unless a test turns one on with a fake HTTP response, the database is a fresh SQLite file
and the AI provider is a scripted fake.
"""
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
for key in ("LLM_API_KEY", "LLM2_API_KEY", "TAVILY_API_KEY", "KKH_RISK_API_URL", "DATABASE_URL", "ADMIN_TOKEN", "VERCEL", "RENDER"):
    os.environ.pop(key, None)
os.environ.update(WEATHER_ENABLED="false", PMD_ALERTS_ENABLED="false", ROUTING_ENABLED="false", PLACES_ENABLED="false",
                  LOG_LEVEL="WARNING")

import pytest  # noqa: E402
import requests  # noqa: E402

import config  # noqa: E402
import storage  # noqa: E402
from security import limiter  # noqa: E402
from services import http as svc_http  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
ADMIN = "test-admin-token-0123456789"


class FakeResponse:
    def __init__(self, payload=None, text: str | None = None, status: int = 200):
        self._payload = payload
        self._text = text if text is not None else (json.dumps(payload) if payload is not None else "")
        self.status_code = status
        self.ok = status < 400

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    @property
    def text(self):
        return self._text

    @property
    def content(self):
        return self._text.encode("utf-8")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")


def _no_network(*args, **kwargs):
    raise AssertionError(f"Unexpected network call: {args[:1]}")


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    limiter.reset()
    svc_http.clear_cache()
    for name, value in (("LLM_API_KEY", ""), ("LLM2_API_KEY", ""), ("TAVILY_API_KEY", ""), ("KKH_RISK_API_URL", ""),
                        ("WEATHER_ENABLED", False), ("PMD_ALERTS_ENABLED", False), ("ROUTING_ENABLED", False),
                        ("PLACES_ENABLED", False),
                        ("ADMIN_TOKEN", ADMIN)):
        monkeypatch.setattr(config, name, value)
    storage.reset_for_tests(f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(svc_http._session, "get", _no_network)
    monkeypatch.setattr(svc_http._session, "post", _no_network)
    monkeypatch.setattr(requests, "post", _no_network)
    yield
    storage.reset_for_tests(None)


@pytest.fixture
def client():
    from app import app
    return app.test_client()


@pytest.fixture
def admin_headers():
    return {"Authorization": f"Bearer {ADMIN}"}


class FakeWeb:
    """Routes HTTP calls made through services.http to handlers keyed by URL prefix."""

    def __init__(self):
        self.routes: list[tuple[str, object]] = []
        self.calls: list[str] = []

    def on(self, prefix: str, handler):
        self.routes.append((prefix, handler))

    def __call__(self, url, **kw):
        self.calls.append(url)
        for prefix, handler in self.routes:
            if url.startswith(prefix):
                resp = handler(url, **kw) if callable(handler) else handler
                return resp
        raise AssertionError(f"Unexpected URL in test: {url}")


@pytest.fixture
def web(monkeypatch):
    fake = FakeWeb()

    def get(url, **kw):
        r = fake(url, **kw)
        r.raise_for_status()
        return r

    monkeypatch.setattr(svc_http, "get", get)
    monkeypatch.setattr(svc_http, "post", get)
    return fake


def open_meteo_payload(start: date, n: int, *, rain: float = 0.0, snow: float = 0.0, code: int = 1,
                       elevation: float = 2450) -> dict:
    dates = [(start + timedelta(days=i)).isoformat() for i in range(n)]
    return {
        "elevation": elevation,
        "current": {"time": f"{date.today().isoformat()}T12:00", "temperature_2m": 11.4, "weather_code": code,
                    "wind_speed_10m": 9.0, "relative_humidity_2m": 40},
        "daily": {"time": dates, "weather_code": [code] * n, "temperature_2m_max": [14.2] * n,
                  "temperature_2m_min": [2.1] * n, "precipitation_sum": [rain] * n, "snowfall_sum": [snow] * n,
                  "precipitation_probability_max": [20] * n},
    }


def open_meteo_handler(**kw):
    def handler(url, params=None, **_):
        params = params or {}
        if "start_date" in params:
            s, e = date.fromisoformat(params["start_date"]), date.fromisoformat(params["end_date"])
            return FakeResponse(open_meteo_payload(s, (e - s).days + 1, **kw))
        return FakeResponse(open_meteo_payload(date.today(), params.get("forecast_days", 7), **kw))
    return handler


def pmd_handlers(web, *, expires: str = "2099-01-01T00:00:00+05:00"):
    feed = (FIXTURES / "pmd_rss.xml").read_text()
    cap = (FIXTURES / "pmd_cap.xml").read_text().replace("EXPIRES_PLACEHOLDER", expires)
    web.on("https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml", FakeResponse(text=feed))
    web.on("https://cap-sources.s3.amazonaws.com/pk-pmd-en/2026-10-09", FakeResponse(text=cap))
    web.on("https://cap-sources.s3.amazonaws.com/pk-pmd-en/2026-10-01",
           FakeResponse(text=(FIXTURES / "pmd_cap_sindh.xml").read_text()))


class ScriptedLLM:
    """Plays back model turns in order and records every request the agent made."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.requests: list[dict] = []

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.requests.append({"url": url, "json": json, "headers": headers})
        if not self.turns:
            return FakeResponse({"choices": [{"message": {"role": "assistant", "content": "Done."}}]})
        turn = self.turns.pop(0)
        if isinstance(turn, FakeResponse):
            return turn
        if isinstance(turn, Exception):
            raise turn
        return FakeResponse({"choices": [{"message": turn}], "usage": {"total_tokens": 100}})


def tool_call(name: str, args: dict, call_id: str = "c1") -> dict:
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": call_id, "type": "function",
                            "function": {"name": name, "arguments": json.dumps(args)}}]}


def say(text: str) -> dict:
    return {"role": "assistant", "content": text}


@pytest.fixture
def ai(monkeypatch):
    """Turn on a fake AI provider. Use ai.script([...turns]) before calling the agent."""
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key-main")
    monkeypatch.setattr(config, "LLM_BASE_URL", "https://llm.test/v1")
    monkeypatch.setattr(config, "LLM_MODEL", "main-model")

    class Holder:
        llm: ScriptedLLM | None = None

        def script(self, turns):
            self.llm = ScriptedLLM(turns)
            monkeypatch.setattr(requests, "post", self.llm)
            return self.llm

    return Holder()
