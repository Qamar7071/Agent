"""Weather Intelligence Agent: live forecasts and official alerts, mapped onto the plan's days.

Sources: Open-Meteo model forecasts (up to 16 days ahead) and the Pakistan Meteorological
Department's public alert feed. Without travel dates there is no forecast to give, and the
result says so instead of guessing.
"""
from concurrent.futures import ThreadPoolExecutor

import data
from agents.base import Agent, AgentResult
from agents.common import plan_of
from services import weather


class WeatherAgent(Agent):
    name = "weather"
    label = "Weather Intelligence"
    description = "Forecasts and official alerts for each day, their uncertainty and the effect on plans."
    depends_on = ("itinerary",)

    def run(self, bb, tracer, tid):
        plan = plan_of(bb)
        req = bb.request
        dests = list(dict.fromkeys(d for d in req.destinations if data.destination(d)))
        retry = bool(bb.hints.get("weather_retry"))
        alerts = self.tool(tracer, tid, "pmd.alerts", weather.pmd_alerts, ok_when=lambda r: r.get("available"),
                           retries=1 if retry else 0, fresh=retry)
        alert_view = {"available": alerts.get("available"), "reason": alerts.get("reason"),
                      "active_count": alerts.get("active_count", 0), "retrieved_at": alerts.get("retrieved_at"),
                      "source": alerts.get("source"),
                      "items": [{"title": a.get("title"), "severity": a.get("severity"), "active": a.get("active"),
                                 "excerpt": a.get("region_excerpt"), "link": a.get("link")}
                                for a in (alerts.get("alerts") or [])[:5]]}

        if not req.start_date:
            seasonal = [{"id": d, "name": data.destination(d)["name"], "note": data.destination(d)["season_note"]}
                        for d in dests]
            return AgentResult(True, {"available": False, "reason": "No travel dates yet: forecasts need dates.",
                                      "seasonal": seasonal, "day_weather": [], "alerts": alert_view, "forecasts": {}},
                               "No dates, so no forecast; gave seasonal notes and checked official alerts",
                               confidence="low", sources=[{"label": "PMD alert feed", "url": alerts.get("source_url")}])

        start = req.start_date.isoformat()
        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {d: pool.submit(self.tool, tracer, tid, f"open-meteo.forecast({d})", weather.forecast, d, start,
                                   len(plan["days"]), ok_when=lambda r: r.get("available"), retries=1 if retry else 0,
                                   fresh=retry)
                    for d in dests}
            fc = {}
            for d, f in futs.items():
                try:
                    fc[d] = f.result()
                except Exception as exc:
                    fc[d] = {"available": False, "reason": str(exc)}

        day_weather, impacts = [], []
        for day in plan["days"]:
            did, when = day.get("destination_id"), day.get("date")
            f = fc.get(did)
            if not (did and when and f and f.get("available")):
                continue
            m = next((x for x in f["days"] if x["date"] == when), None)
            if not m:
                continue
            entry = {"day": day["day"], "date": when, "destination_id": did, "summary": m["summary"],
                     "max_c": m["max_c"], "min_c": m["min_c"], "rain_mm": m["rain_mm"], "snow_cm": m["snow_cm"],
                     "rain_chance_pct": m["rain_chance_pct"], "code": m["code"], "risks": m["risks"],
                     "confidence": m["confidence"]}
            day_weather.append(entry)
            if m["risks"]:
                impacts.append({"day": day["day"], "date": when, "plan": day["title"], "risks": m["risks"],
                                "alternative": data.destination(did).get("bad_weather_alternative")})
        available = [d for d, f in fc.items() if f.get("available")]
        missing = {d: f.get("reason") for d, f in fc.items() if not f.get("available")}
        beyond = [d for d, r in missing.items() if r and "16 days" in r]
        conf = "high" if available and not missing else ("medium" if available else "low")
        if day_weather and any(str(d["confidence"]).startswith("lower") for d in day_weather):
            conf = "medium"
        summary = (f"Forecast for {len(day_weather)} plan days from Open-Meteo; {len(impacts)} days with weather risks"
                   if day_weather else
                   ("Dates are beyond the 16-day forecast range: only seasonal patterns are known" if beyond
                    else "No forecast available for these dates"))
        issues = [{"code": "weather_unavailable", "message": f"{data.place_name(d)}: {r}", "retryable": "reached" in (r or "")}
                  for d, r in missing.items() if d not in beyond]
        reason = None if available else (next(iter(missing.values()), None) or "No forecast for these dates.")
        return AgentResult(True, {"available": bool(available), "reason": reason, "forecasts": {
            d: {"available": f.get("available"), "reason": f.get("reason"), "retrieved_at": f.get("retrieved_at"),
                "seasonal_note": f.get("seasonal_note")} for d, f in fc.items()},
            "day_weather": day_weather, "impacts": impacts, "alerts": alert_view,
            "note": "Model forecasts, not observations. More than 7 days ahead they are less reliable."},
            summary, confidence=conf, issues=issues,
            sources=[{"label": "Open-Meteo forecast model", "url": "https://open-meteo.com/"},
                     {"label": "PMD alert feed", "url": alerts.get("source_url")}])
