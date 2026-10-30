"""Predictive Safety Agent: a transparent risk score for each day of the trip.

The score adds up documented factors, each with a weight from shared/destinations.json →
risk_model (so weights can be changed without touching code) and an intensity from 0 to 1
taken from evidence: the live forecast, official PMD alerts, typical seasonal closures, drive
length, daylight, altitude and any Travel Twin scenario. Every point in the score can be traced
to a piece of evidence with its source.

It is a heuristic from public data, not an official safety assessment, and it never says a road
is open: live road status does not exist for Gilgit-Baltistan, so confidence is at most medium.
"""
import data
from agents.base import Agent, AgentResult
from agents.common import plan_of
from services import http, roads

REGION_WORDS = ("gilgit", "baltistan", "hunza", "skardu", "nagar", "ghanche", "shigar", "diamer", "astore", "kkh",
                "karakoram", "chilas")


def model() -> dict:
    return data.dataset()["risk_model"]


def category(score: float) -> str:
    name = "Low"
    for c in model()["categories"]:
        if score >= c["min"]:
            name = c["name"]
    return name


def _places_reached(day: dict) -> list[str]:
    """Places the traveller actually gets to that day (not just the destination the day belongs to)."""
    out = [m["to"] for m in day.get("moves", [])]
    hub = (day.get("overnight") or {}).get("hub")
    if hub:
        out.append(hub)
    if not day.get("moves") and day.get("destination_id"):
        out.append(day["destination_id"])
    return list(dict.fromkeys(out))


def _altitude(key: str) -> int:
    d = data.destination(key)
    return d["altitude_m"] if d else (data.dataset()["hubs"].get(key) or {}).get("altitude_m") or 0


def _month(plan: dict, day: dict) -> int | None:
    if day.get("date"):
        return int(day["date"][5:7])
    return plan["request"].get("travel_month")


def assess(plan: dict, weather: dict | None, scenario: dict | None = None, reports: list | None = None) -> dict:
    w = model()["weights"]
    seasonal = {r["id"]: r for r in data.seasonal_routes()}
    route_of = {"khunjerab": "khunjerab-pass", "deosai": "deosai-road", "fairy-meadows": "fairy-meadows-track"}
    day_w = {d["day"]: d for d in (weather or {}).get("day_weather", [])}
    alerts = [a for a in ((weather or {}).get("alerts") or {}).get("items", []) if a.get("active")]
    retrieved = (weather or {}).get("alerts", {}).get("retrieved_at") or http.now_iso()
    has_dates = bool(plan["request"].get("start_date"))
    days_out = []
    for day in plan["days"]:
        factors = []

        def add(key, intensity, evidence, source, kind="live"):
            if intensity > 0:
                factors.append({"factor": key, "weight": w[key], "intensity": round(intensity, 2),
                                "points": round(w[key] * intensity, 1), "evidence": evidence, "source": source,
                                "kind": kind})

        dest = data.destination(day.get("destination_id") or "")
        month = _month(plan, day)
        fx = day_w.get(day["day"])
        if fx:
            heavy = 1.0 if (fx["code"] in (95, 96, 99) or (fx["rain_mm"] or 0) >= 20 or (fx["snow_cm"] or 0) >= 5) else \
                0.6 if ((fx["rain_mm"] or 0) >= 10 or (fx["snow_cm"] or 0) > 0) else \
                0.4 if (fx["min_c"] is not None and fx["min_c"] <= -5) else 0
            add("forecast_severe", heavy, f"{fx['summary']}, rain {fx['rain_mm']} mm, snow {fx['snow_cm']} cm, "
                f"low {fx['min_c']} °C on {fx['date']}", "Open-Meteo forecast")
        for a in alerts:
            text = (a.get("excerpt") or "").lower()
            if any(word in text for word in REGION_WORDS):
                named = dest and dest["name"].split()[0].lower() in text
                add("official_alert", 1.0 if named else 0.7 if has_dates else 0.5,
                    f"Active PMD alert: {a.get('title')}" + ("" if has_dates else " (in force now; your dates are not set)"),
                    "Pakistan Meteorological Department", kind="official")
                break
        reached = _places_reached(day)
        for did in reached:
            if month and did in route_of:
                r = seasonal[route_of[did]]
                if month not in r["typical_open_months"]:
                    add("seasonal_closure", 1.0, f"{r['name']} is usually closed in this month.",
                        "Raahi guide (typical pattern)", kind="typical")
                    break
        moving = [m for m in day.get("moves", []) if m["mode"] != "flight"]
        if moving and month in (7, 8):
            add("monsoon_landslide", 1.0, "Monsoon months: landslides often block the KKH and the Skardu road.",
                "Raahi guide (typical pattern)", kind="typical")
        elif moving and month in (6, 9):
            add("monsoon_landslide", 0.5, "Edge of the monsoon: rain can still trigger landslides.",
                "Raahi guide (typical pattern)", kind="typical")
        if moving and month in (12, 1, 2):
            add("winter_conditions", 1.0, "Winter: snow and ice on mountain roads, short daylight.",
                "Raahi guide (typical pattern)", kind="typical")
        elif moving and month in (11, 3):
            add("winter_conditions", 0.5, "Early or late winter: cold nights and possible snow.",
                "Raahi guide (typical pattern)", kind="typical")
        hours = max([m["hours"][1] for m in moving] or [0])
        if hours >= 10:
            add("long_drive", 1.0, f"Up to {hours:g} hours on mountain roads.", "Raahi road data", kind="plan")
        elif hours >= 8:
            add("long_drive", 0.6, f"Up to {hours:g} hours on mountain roads.", "Raahi road data", kind="plan")
        if any((m.get("timing") or {}).get("after_dark_risk") for m in moving):
            add("after_dark", 1.0, "This drive may end after dark.", "Raahi daylight check", kind="plan")
        top = max(reached, key=_altitude, default=None)
        top_alt = _altitude(top) if top else 0
        if top_alt >= 3500:
            add("high_altitude", 1.0 if top_alt >= 4500 else 0.6, f"{data.place_name(top)} is at about {top_alt:,} m.",
                "Raahi guide", kind="plan")
        if scenario and scenario.get("hazard_from_day") and day["day"] >= scenario["hazard_from_day"]:
            exposed = bool(moving) or top_alt >= 3000
            add("scenario_hazard", 1.0 if exposed else 0.4, scenario.get("hazard_text", "Scenario hazard"),
                "Travel Twin scenario (assumption, not a forecast)", kind="scenario")
        for rep in reports or []:
            if rep.get("day") == day["day"]:
                add("community_reports", rep.get("intensity", 0.5), rep["text"], "Community report", kind="community")
        score = min(100, round(sum(f["points"] for f in factors)))
        cat = category(score)
        alt = None
        if cat in ("High", "Severe"):
            alt = (dest or {}).get("bad_weather_alternative") if fx and fx.get("risks") else \
                "Add a buffer day so you can wait out bad conditions, or start the drive at first light."
        days_out.append({"day": day["day"], "date": day.get("date"), "title": day["title"], "score": score,
                         "category": cat, "factors": sorted(factors, key=lambda f: -f["points"]),
                         "action": model()["actions"][cat], "alternative": alt})
    overall = max(days_out, key=lambda d: d["score"]) if days_out else None
    forecast_days = len(day_w)
    if not has_dates:
        conf, why = "low", "No travel dates, so no forecast: only typical patterns and plan factors are scored."
    elif forecast_days == 0:
        reason = (weather or {}).get("reason")
        conf, why = "low", (f"No forecast was used: {reason[0].lower()}{reason[1:]}" if reason
                            else "No forecast covers these dates yet.")
    else:
        conf, why = "medium", ("Forecast and official alerts are included, but no live road status exists for these "
                               "roads, so confidence cannot be high.")
    return {"overall": {"score": overall["score"] if overall else 0, "category": overall["category"] if overall else "Low",
                        "worst_day": overall["day"] if overall else None,
                        "action": model()["actions"][overall["category"] if overall else "Low"]},
            "days": days_out, "confidence": conf, "confidence_reason": why, "checked_at": http.now_iso(),
            "alerts_checked_at": retrieved, "weights": model()["weights"], "model_version": model()["version"],
            "disclaimer": model()["note"],
            "not_included": ["Live road status (no public source exists)",
                             "Community reports (coming with Local Pulse)" if not reports else None]}


class SafetyAgent(Agent):
    name = "safety"
    label = "Predictive Safety"
    description = "Transparent day-by-day risk score from forecasts, alerts, seasons, drive length and altitude."
    depends_on = ("itinerary", "weather")

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        status = self.tool(tracer, tid, "roads.status", roads.road_status, list(bb.request.destinations),
                           bb.request.start_date.isoformat() if bb.request.start_date else None)
        risk = self.tool(tracer, tid, "risk.assess", assess, plan, bb.get("weather"), bb.scenario)
        risk["not_included"] = [x for x in risk["not_included"] if x]
        risk["road_status"] = {"status": status["status"], "headline": status["headline"],
                               "official_checks": status.get("official_checks"), "rule": status.get("rule")}
        o = risk["overall"]
        high = [d for d in risk["days"] if d["category"] in ("High", "Severe")]
        summary = (f"Overall {o['category']} ({o['score']}/100, worst day {o['worst_day']}); "
                   f"{len(high)} day(s) need changes; confidence {risk['confidence']}")
        return AgentResult(True, risk, summary, confidence=risk["confidence"],
                           sources=[{"label": "PMD alert feed", "url": "https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml"},
                                    {"label": "Open-Meteo", "url": "https://open-meteo.com/"}])
