"""All settings come from environment variables (never hard-coded secrets).

Local development reads backend/.env (python-dotenv). On Vercel/Render set them in the
dashboard. See .env.example for the full, documented list.
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except Exception:  # dotenv is optional in production
    pass

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
SHARED_DATA = ROOT_DIR / "shared" / "destinations.json"
DIST_DIR = ROOT_DIR / "dist"


# An empty value (e.g. "ALLOWED_ORIGINS=" copied from .env.example) counts as not set.
def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


def _num(name: str, default: float, kind=float):
    raw = _get(name, str(default))
    try:
        return kind(raw)
    except ValueError:
        raise ValueError(f"Setting {name} must be a number, not {raw!r}.") from None


def _bool(name: str, default: str = "false") -> bool:
    return _get(name, default).lower() in ("1", "true", "yes", "on")


def _list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in _get(name, default).split(",") if x.strip()]


ON_VERCEL = bool(os.environ.get("VERCEL"))
ON_RENDER = bool(os.environ.get("RENDER"))
ENV = _get("RAAHI_ENV", "production" if ON_VERCEL else "development")

# ── AI providers (OpenAI-compatible chat completions with tool calling) ──────────
# Main provider + optional backup provider. Keys stay on the server.
LLM_API_KEY = _get("LLM_API_KEY")
# Defaults kept from the original project (OpenAI). Groq, Gemini, OpenRouter… work too.
LLM_BASE_URL = _get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
LLM_MODEL = _get("LLM_MODEL", "gpt-4o-mini")
LLM_FALLBACK_MODELS = _list("LLM_FALLBACK_MODELS")
LLM2_API_KEY = _get("LLM2_API_KEY")
LLM2_BASE_URL = _get("LLM2_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
LLM2_MODEL = _get("LLM2_MODEL", "gemini-3.8-flash")
LLM2_FALLBACK_MODELS = _list("LLM2_FALLBACK_MODELS")
LLM_TIMEOUT_S = _num("LLM_TIMEOUT_S", 20)
LLM_MAX_TOKENS = _num("LLM_MAX_TOKENS", 900, int)

# Agent guard rails
AGENT_MAX_STEPS = _num("AGENT_MAX_STEPS", 6, int)          # model turns per message
AGENT_MAX_TOOL_CALLS = _num("AGENT_MAX_TOOL_CALLS", 10, int)
AGENT_DEADLINE_S = _num("AGENT_DEADLINE_S", 45)      # whole request budget
AGENT_TOOL_RESULT_CHARS = _num("AGENT_TOOL_RESULT_CHARS", 6000, int)

# ── Storage ──────────────────────────────────────────────────────────────────────
# Postgres in production (e.g. Neon / Vercel Postgres / Supabase), SQLite locally.
# Vercel and Render have no lasting disk by default, so there saving stays off until
# DATABASE_URL is set (the API says so) instead of "saving" into a file that disappears
# on the next deploy. Locally it falls back to a SQLite file.
DATABASE_URL = _get("DATABASE_URL")
if not DATABASE_URL and not (ON_VERCEL or ON_RENDER):
    DATABASE_URL = f"sqlite:///{BASE_DIR / 'raahi.db'}"
STORAGE_ENABLED = bool(DATABASE_URL)

ADMIN_TOKEN = _get("ADMIN_TOKEN")   # protects /api/admin/*

# ── Live data ────────────────────────────────────────────────────────────────────
HTTP_TIMEOUT_S = _num("HTTP_TIMEOUT_S", 8)
CONTACT = _get("RAAHI_CONTACT", "https://github.com/Qamar7071/Agent")
WEATHER_ENABLED = _bool("WEATHER_ENABLED", "true")
PMD_ALERTS_ENABLED = _bool("PMD_ALERTS_ENABLED", "true")
ROUTING_ENABLED = _bool("ROUTING_ENABLED", "true")
PLACES_ENABLED = _bool("PLACES_ENABLED", "true")        # OpenStreetMap stays and food
OVERPASS_URLS = _list("OVERPASS_URLS", "https://overpass-api.de/api/interpreter,"
                                       "https://overpass.private.coffee/api/interpreter,"
                                       "https://maps.mail.ru/osm/tools/overpass/api/interpreter,"
                                       "https://overpass.kumi.systems/api/interpreter")
OSRM_URL = _get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
TAVILY_API_KEY = _get("TAVILY_API_KEY")       # optional road news search
KKH_RISK_API_URL = _get("KKH_RISK_API_URL").rstrip("/")  # optional KKH model

# ── Web ──────────────────────────────────────────────────────────────────────────
SITE_URL = _get("SITE_URL", "https://north-kappa-ivory.vercel.app").rstrip("/")
ALLOWED_ORIGINS = _list("ALLOWED_ORIGINS", SITE_URL + ",http://localhost:5173,http://localhost:5000")
MAX_BODY_BYTES = _num("MAX_BODY_BYTES", 64 * 1024, int)
# Trust X-Forwarded-For only behind a proxy that sets it (Vercel and Render do).
TRUST_PROXY = _bool("TRUST_PROXY", "true" if (ON_VERCEL or ON_RENDER) else "false")
PLAN_RATE_PER_MIN = _num("PLAN_RATE_PER_MIN", 40, int)
LIVE_RATE_PER_MIN = _num("LIVE_RATE_PER_MIN", 60, int)
CHAT_RATE_PER_MIN = _num("CHAT_RATE_PER_MIN", 12, int)
WRITE_RATE_PER_MIN = _num("WRITE_RATE_PER_MIN", 6, int)


def llm_providers() -> list[dict]:
    """Providers to try, in order. Each brings its own key, base URL and models."""
    out = []
    if LLM_API_KEY:
        out.append({"name": "main", "key": LLM_API_KEY, "base": LLM_BASE_URL,
                    "models": list(dict.fromkeys([LLM_MODEL, *LLM_FALLBACK_MODELS]))})
    if LLM2_API_KEY:
        out.append({"name": "backup", "key": LLM2_API_KEY, "base": LLM2_BASE_URL,
                    "models": list(dict.fromkeys([LLM2_MODEL, *LLM2_FALLBACK_MODELS]))})
    return out


def llm_enabled() -> bool:
    return bool(llm_providers())
