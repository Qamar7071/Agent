"""Road-status intelligence for Northern Pakistan routes.

The honest position, built into every answer:
- There is no public, machine-readable official road-status feed for the KKH or GB roads
  that this app is permitted to read. NHMP publishes travel advisories on a web page and
  runs the 130 helpline; those are linked for the traveller to check.
- So live status is NEVER reported as "open". The result always says the current status
  could not be verified, and then adds what *is* known, each item labelled:
    * official weather alerts (PMD CAP feed) that can affect roads,
    * the typical seasonal pattern of high passes (not live),
    * optional: news reports (unverified) via TAVILY_API_KEY,
    * optional: the KKH Road Status Predictor model (an estimate) via KKH_RISK_API_URL.
- "No closure report found" never means "open".
"""
import logging
from datetime import date

import config
import data
from services import http, weather

log = logging.getLogger("raahi.roads")

NHMP_ADVISORY = "https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx"
OFFICIAL_CHECKS = [
    {"name": "National Highways & Motorway Police (NHMP) travel advisory", "url": NHMP_ADVISORY,
     "phone": "130", "note": "Official road advisories and the 130 helpline. Check on the morning you travel."},
    {"name": "Pakistan Meteorological Department", "url": "https://www.pmd.gov.pk", "note": "Forecasts and weather warnings."},
    {"name": "National Disaster Management Authority", "url": "https://www.ndma.gov.pk", "note": "Flood and landslide advisories."},
]

# Main roads used to reach each destination (for naming and news queries).
ROADS = {
    "kkh-south": {"name": "Karakoram Highway (N-35), Islamabad/Havelian–Besham–Chilas", "query": "Karakoram Highway KKH Besham Chilas"},
    "kkh-north": {"name": "Karakoram Highway (N-35), Chilas–Gilgit–Hunza–Sost", "query": "Karakoram Highway Gilgit Hunza"},
    "skardu-road": {"name": "Jaglot–Skardu Road (S-1)", "query": "Skardu road Jaglot"},
    "babusar": {"name": "Babusar Top (Naran–Chilas, summer alternative)", "query": "Babusar Top road"},
}
DEST_ROADS = {
    "hunza": ["kkh-south", "kkh-north"], "attabad": ["kkh-south", "kkh-north"], "passu": ["kkh-south", "kkh-north"],
    "khunjerab": ["kkh-south", "kkh-north"], "skardu": ["kkh-south", "skardu-road"], "deosai": ["kkh-south", "skardu-road"],
    "k2": ["kkh-south", "skardu-road"], "fairy-meadows": ["kkh-south"],
}
DEST_SEASONAL = {"khunjerab": ["khunjerab-pass"], "deosai": ["deosai-road"], "fairy-meadows": ["fairy-meadows-track"]}
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]
CLOSURE_WORDS = ("blocked", "closed", "closure", "landslide", "suspended", "stranded", "shut")


def seasonal_outlook(dest_ids: list[str], month: int | None) -> list[dict]:
    """Typical seasonal pattern for high routes on the user's travel month. NOT live data."""
    routes = {r["id"]: r for r in data.seasonal_routes()}
    ids = []
    for did in dest_ids:
        ids += DEST_SEASONAL.get(did, [])
    if month and month in (6, 7, 8, 9, 10):
        ids.append("babusar-top")   # only relevant as a summer alternative
    out = []
    for rid in dict.fromkeys(ids):
        r = routes.get(rid)
        if not r:
            continue
        months = r["typical_open_months"]
        item = {"route": r["name"], "typical_open_months": months, "note": r["note"],
                "typical_open_text": f"{MONTH_NAMES[months[0] - 1]}–{MONTH_NAMES[months[-1] - 1]}",
                "kind": "typical seasonal pattern (not live status)"}
        if month:
            item["usually_open_that_month"] = month in r["typical_open_months"]
        out.append(item)
    return out


def _news(dest_ids: list[str]) -> dict:
    if not config.TAVILY_API_KEY:
        return {"available": False, "reason": "News search is not configured (optional TAVILY_API_KEY)."}
    roads = []
    for did in dest_ids:
        roads += DEST_ROADS.get(did, [])
    query = " OR ".join(f'"{ROADS[r]["query"]}"' for r in dict.fromkeys(roads)) or "Karakoram Highway"
    query += " road blocked OR closed OR landslide OR open"

    def go():
        try:
            j = http.post("https://api.tavily.com/search", json={
                "api_key": config.TAVILY_API_KEY, "query": query, "topic": "news", "days": 3, "max_results": 6,
            }, timeout=config.HTTP_TIMEOUT_S + 4).json()
        except Exception as exc:
            log.warning("News search failed: %s", exc)
            return {"available": False, "reason": "News search could not be reached right now."}
        items = []
        for r in j.get("results", []):
            text = f"{r.get('title', '')} {r.get('content', '')}".lower()
            items.append({"title": (r.get("title") or "")[:200], "url": r.get("url"), "published": r.get("published_date"),
                          "mentions_closure": any(w in text for w in CLOSURE_WORDS)})
        return {"available": True, "items": items, "retrieved_at": http.now_iso(), "source": "Web news search (Tavily)",
                "status": "unverified reports",
                "note": "News reports are not official confirmation and can be out of date."}

    return http.cached(f"roadnews:{query}", 1800, go)


def _kkh_model(dest_ids: list[str]) -> dict:
    if not config.KKH_RISK_API_URL:
        return {"available": False, "reason": "The KKH risk model is not connected (optional KKH_RISK_API_URL)."}
    if not any("kkh-north" in DEST_ROADS.get(d, []) or "kkh-south" in DEST_ROADS.get(d, []) for d in dest_ids):
        return {"available": False, "reason": "Not a KKH route."}

    def go():
        try:
            j = http.get(f"{config.KKH_RISK_API_URL}/api/predict", timeout=config.HTTP_TIMEOUT_S + 7).json()
        except Exception as exc:
            log.warning("KKH model failed: %s", exc)
            return {"available": False, "reason": "The KKH risk model could not be reached right now."}
        synthetic = (j.get("data_mode") or "").lower() == "synthetic"
        segs = [{"segment": s.get("name"), "risk": (s.get("band") or {}).get("label"), "probability": s.get("probability"),
                 "seasonal_closure": s.get("seasonal_closure")} for s in j.get("segments", [])]
        return {"available": True, "kind": "model estimate (probability of a blockage), not observed status",
                "experimental": synthetic,
                "caveat": ("Experimental: this model was trained on synthetic data and must not be used for travel decisions."
                           if synthetic else "A statistical estimate; it can be wrong."),
                "target_date": j.get("target_date"), "generated_at": j.get("generated_at"),
                "p_whole_route_clear": (j.get("summary") or {}).get("p_full_route_open"), "segments": segs,
                "source": "KKH Road Status Predictor", "source_url": config.KKH_RISK_API_URL}

    return http.cached("kkh-model", 1800, go)


def road_status(dest_ids: list[str], travel_date: str | None = None) -> dict:
    ids = [d for d in dest_ids if data.destination(d)] or ["hunza", "skardu"]
    month = None
    if travel_date:
        try:
            month = date.fromisoformat(travel_date).month
        except ValueError:
            month = None
    roads = [ROADS[r]["name"] for r in dict.fromkeys(sum((DEST_ROADS.get(d, []) for d in ids), []))]
    alerts = weather.pmd_alerts()
    news = _news(ids)
    model = _kkh_model(ids)
    reported = [n for n in news.get("items", []) if n.get("mentions_closure")] if news.get("available") else []
    return {
        "status": "not_verified",
        "headline": "Current road status could not be verified.",
        "explanation": ("There is no official machine-readable road-status feed for these routes. "
                        "Raahi cannot confirm that any road is open; check NHMP (130) on the morning you travel."),
        "routes": roads,
        "unverified_closure_reports": reported,
        "official_weather_alerts": alerts,
        "seasonal_outlook": seasonal_outlook(ids, month),
        "news": news,
        "model_estimate": model,
        "official_checks": OFFICIAL_CHECKS,
        "retrieved_at": http.now_iso(),
        "rule": "No closure report found does not mean the road is open.",
    }
