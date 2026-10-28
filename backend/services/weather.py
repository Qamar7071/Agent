"""Weather for trip planning.

1. Forecasts: Open-Meteo (https://open-meteo.com, free, no key). Model forecasts, up to
   16 days ahead. Days more than 7 days out are flagged as lower confidence.
2. Official alerts: Pakistan Meteorological Department CAP feed
   (https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml, published as public domain).

Every result carries its source and the time it was retrieved. If a service cannot be
reached the result says so (available: False) — nothing is ever made up.
"""
import logging
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import config
import data
from clock import today_pk
from services import http

log = logging.getLogger("raahi.weather")

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
PMD_FEED = "https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml"
MAX_AHEAD_DAYS = 15          # Open-Meteo returns today + 15 days
CONFIDENT_DAYS = 7

WMO = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers",
    81: "Rain showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
}
STORM = {95, 96, 99}

# Words that tie a PMD alert to the areas Raahi covers (GB, the KKH corridor, upper KP).
REGION_WORDS = ("gilgit", "baltistan", "hunza", "skardu", "diamer", "diamir", "astore", "ghizer", "ghanche",
                "shigar", "nagar", "kohistan", "karakoram", "kkh", "chilas", "babusar", "naran", "kaghan",
                "mansehra", "chitral", "khunjerab")


def _risks(day: dict) -> list[str]:
    out = []
    if day["code"] in STORM:
        out.append("Thunderstorms forecast")
    if (day.get("rain_mm") or 0) >= 20:
        out.append(f"Heavy rain forecast ({day['rain_mm']} mm): landslide risk on mountain roads")
    elif (day.get("rain_mm") or 0) >= 10:
        out.append(f"Significant rain forecast ({day['rain_mm']} mm)")
    if (day.get("snow_cm") or 0) >= 5:
        out.append(f"Snowfall forecast ({day['snow_cm']} cm): high passes may be affected")
    if day.get("min_c") is not None and day["min_c"] <= -5:
        out.append(f"Hard frost ({day['min_c']} °C): icy roads in the morning")
    return out


def _fetch_forecast(lat: float, lng: float, start: date | None, end: date | None) -> dict:
    params = {
        "latitude": lat, "longitude": lng, "timezone": "Asia/Karachi",
        "current": "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,"
                 "precipitation_probability_max",
    }
    if start and end:
        params.update(start_date=start.isoformat(), end_date=end.isoformat())
    else:
        params["forecast_days"] = 7
    j = http.get(OPEN_METEO, params=params).json()
    today = today_pk()
    dl = j["daily"]
    days = []
    for i, iso in enumerate(dl["time"]):
        code = dl["weather_code"][i] if dl["weather_code"][i] is not None else 0
        lead = (date.fromisoformat(iso) - today).days
        day = {
            "date": iso, "code": code, "summary": WMO.get(code, "Mixed conditions"),
            "max_c": _round(dl["temperature_2m_max"][i]), "min_c": _round(dl["temperature_2m_min"][i]),
            "rain_mm": _round(dl["precipitation_sum"][i], 1), "snow_cm": _round(dl["snowfall_sum"][i], 1),
            "rain_chance_pct": dl["precipitation_probability_max"][i],
            "lead_days": lead, "confidence": "higher" if lead <= CONFIDENT_DAYS else "lower (more than a week ahead)",
        }
        day["risks"] = _risks(day)
        days.append(day)
    cur = j.get("current") or {}
    current = None
    if cur:
        current = {
            "kind": "Current conditions from the forecast model (not a weather-station observation)",
            "time": cur.get("time"), "temp_c": _round(cur.get("temperature_2m")),
            "summary": WMO.get(cur.get("weather_code"), "—"), "wind_kmh": _round(cur.get("wind_speed_10m")),
            "humidity_pct": cur.get("relative_humidity_2m"),
        }
    return {"current": current, "days": days, "model_elevation_m": j.get("elevation")}


def _round(v, nd=0):
    if v is None:
        return None
    return round(v, nd) if nd else round(v)


def forecast(dest_id: str, start: str | None = None, days: int | None = None) -> dict:
    """Forecast for a destination, optionally for specific trip dates."""
    d = data.destination(dest_id)
    if not d:
        return {"available": False, "reason": f"Unknown destination '{dest_id}'."}
    base = {"destination": {"id": dest_id, "name": d["name"], "altitude_m": d["altitude_m"]},
            "source": "Open-Meteo forecast model", "source_url": "https://open-meteo.com/"}
    if not config.WEATHER_ENABLED:
        return {**base, "available": False, "reason": "Live weather is switched off on this server."}
    today = today_pk()
    s = e = None
    if start:
        try:
            s = date.fromisoformat(start)
        except ValueError:
            return {**base, "available": False, "reason": "The start date is not a valid YYYY-MM-DD date."}
        e = s + timedelta(days=max(1, min(int(days or 3), 16)) - 1)
        if e < today:
            return {**base, "available": False, "reason": "Those dates are in the past."}
        if s > today + timedelta(days=MAX_AHEAD_DAYS):
            return {**base, "available": False,
                    "reason": f"Forecasts only reach about {MAX_AHEAD_DAYS + 1} days ahead. For {s.isoformat()} only "
                              "seasonal norms are known; check again closer to the date.",
                    "seasonal_note": d["season_note"]}
        s, e = max(s, today), min(e, today + timedelta(days=MAX_AHEAD_DAYS))

    def go():
        try:
            out = _fetch_forecast(d["coords"]["lat"], d["coords"]["lng"], s, e)
        except Exception as exc:  # network, HTTP or format error
            log.warning("Open-Meteo failed for %s: %s", dest_id, exc)
            return {**base, "available": False, "reason": "The weather service could not be reached right now."}
        out.update(base)
        out["available"] = True
        out["retrieved_at"] = http.now_iso()
        out["note"] = ("Model forecast for the area around the destination; mountain weather changes fast and a "
                       "forecast does not mean a road or trek is safe. The source does not publish the model run time.")
        if out.get("model_elevation_m") and abs(out["model_elevation_m"] - d["altitude_m"]) > 400:
            out["note"] += (f" The model grid cell sits at about {round(out['model_elevation_m'])} m while the "
                            f"destination is about {d['altitude_m']} m, so temperatures may differ.")
        return out

    return http.cached(f"wx:{dest_id}:{s}:{e}", 1800, go)


# ── Official alerts (PMD CAP) ─────────────────────────────────────────────────────
CAP_NS = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}


def _parse_cap(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)
    info = root.find("cap:info", CAP_NS)
    g = lambda el, tag: (el.findtext(f"cap:{tag}", default="", namespaces=CAP_NS) or "").strip()  # noqa: E731
    return {
        "sent": g(root, "sent"), "headline": g(info, "headline"), "event": g(info, "event"),
        "severity": g(info, "severity"), "certainty": g(info, "certainty"), "urgency": g(info, "urgency"),
        "onset": g(info, "onset"), "expires": g(info, "expires"), "description": g(info, "description"),
        "instruction": g(info, "instruction"), "sender": g(info, "senderName"),
        "areas": [a.findtext("cap:areaDesc", default="", namespaces=CAP_NS) for a in info.findall("cap:area", CAP_NS)],
    }


_REGION_RE = re.compile(r"\b(" + "|".join(REGION_WORDS) + r")\b", re.I)


def _region_excerpt(text: str) -> str | None:
    """The part of a national bulletin that talks about our region (GB lines first)."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    gb = [ln for ln in lines if re.search(r"gilgit|baltistan", ln, re.I)]
    other = [ln for ln in lines if _REGION_RE.search(ln)]
    pick = (gb or other or [None])[0]
    return pick[:600] if pick else None


def pmd_alerts(limit: int = 5) -> dict:
    """Recent official PMD alerts that mention Gilgit-Baltistan / the KKH corridor."""
    base = {"source": "Pakistan Meteorological Department (CAP alert feed)", "source_url": PMD_FEED,
            "official": True}
    if not config.PMD_ALERTS_ENABLED:
        return {**base, "available": False, "reason": "Official alert feed is switched off on this server."}

    def go():
        try:
            feed = ET.fromstring(http.get(PMD_FEED).content)
        except Exception as exc:
            log.warning("PMD feed failed: %s", exc)
            return {**base, "available": False, "reason": "The PMD alert feed could not be reached right now."}
        ch = feed.find("channel")
        items = ch.findall("item")[:limit] if ch is not None else []
        last_build = ch.findtext("lastBuildDate") if ch is not None else None
        now = datetime.now(timezone.utc)
        alerts = []
        for it in items:
            link = it.findtext("link") or ""
            entry = {"title": it.findtext("title"), "link": link, "published": _rfc822(it.findtext("pubDate"))}
            try:
                cap = _parse_cap(http.get(link).text)
            except Exception:
                cap = None
            if cap:
                expires = _iso(cap["expires"])
                entry.update(severity=cap["severity"], certainty=cap["certainty"], urgency=cap["urgency"],
                             onset=cap["onset"], expires=cap["expires"], sender=cap["sender"],
                             active=bool(expires and expires > now))
                text = cap["description"] + "\n" + " ".join(cap["areas"])
            else:
                entry.update(active=None)
                text = it.findtext("description") or ""
            excerpt = _region_excerpt(text)
            if excerpt:
                entry["region_excerpt"] = excerpt
                alerts.append(entry)
        return {**base, "available": True, "retrieved_at": http.now_iso(), "feed_updated": _rfc822(last_build),
                "alerts": alerts, "active_count": sum(1 for a in alerts if a.get("active")),
                "note": "Weather alerts only. PMD does not publish road status in this feed."}

    return http.cached("pmd-alerts", 1800, go)


def _rfc822(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc).isoformat(timespec="seconds")
    except Exception:
        return s


def _iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None
