"""Live conditions for a trip, fetched in parallel with a time limit:

- a weather forecast for each destination (Open-Meteo),
- official PMD weather alerts and the honest road-status summary (services.roads).

Each part reports its own availability, source and retrieval time, so a slow or failing
service never blocks the others and is never papered over.
"""
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import date

import data
from clock import today_pk
from services import http, roads, weather

TIMEOUT_S = 15


def trip_conditions(dest_ids: list[str], start_date: str | None = None, days: int | None = None,
                    plan_days: list[dict] | None = None, timeout_s: float = TIMEOUT_S) -> dict:
    ids = [d for d in dict.fromkeys(dest_ids) if data.destination(d)][:6]
    pool = ThreadPoolExecutor(max_workers=6)
    try:
        forecasts = {did: pool.submit(weather.forecast, did, start_date, days) for did in ids}
        road = pool.submit(roads.road_status, ids, start_date)
        wait([*forecasts.values(), road], timeout=timeout_s)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    def result(fut, fallback):
        if fut.done() and not fut.cancelled() and fut.exception() is None:
            return fut.result()
        return fallback

    fc = {did: result(f, {"available": False, "reason": "The weather service took too long to answer.",
                          "source": "Open-Meteo forecast model", "source_url": "https://open-meteo.com/"})
          for did, f in forecasts.items()}
    road_status = result(road, {
        "status": "not_verified", "headline": "Current road status could not be verified.",
        "explanation": "The road and alert checks took too long. Check NHMP (130) on the morning you travel.",
        "official_checks": roads.OFFICIAL_CHECKS, "retrieved_at": http.now_iso(),
        "rule": "No closure report found does not mean the road is open."})

    day_weather = []
    for day in plan_days or []:
        did, when = day.get("destination_id"), day.get("date")
        f = fc.get(did)
        if not (did and when and f and f.get("available")):
            continue
        match = next((x for x in f["days"] if x["date"] == when), None)
        if not match:
            continue
        entry = {"day": day.get("day"), "date": when, "destination_id": did, "destination_name": f["destination"]["name"],
                 "code": match["code"], "summary": match["summary"],
                 "max_c": match["max_c"], "min_c": match["min_c"], "rain_mm": match["rain_mm"],
                 "snow_cm": match["snow_cm"], "rain_chance_pct": match["rain_chance_pct"],
                 "risks": match["risks"], "confidence": match["confidence"]}
        if match["risks"]:
            entry["alternative"] = data.destination(did).get("bad_weather_alternative")
        day_weather.append(entry)

    notes = []
    if start_date:
        try:
            lead = (date.fromisoformat(start_date) - today_pk()).days
            if lead > weather.MAX_AHEAD_DAYS:
                notes.append("Your dates are beyond the forecast range (about 16 days). Showing what is known now; "
                             "check again closer to the trip.")
        except ValueError:
            pass
    return {
        "retrieved_at": http.now_iso(),
        "forecasts": fc,
        "day_weather": day_weather,
        "weather_flags": [{"day": d["day"], "date": d["date"], "destination_id": d["destination_id"],
                           "message": "; ".join(d["risks"])} for d in day_weather if d["risks"]],
        "roads": road_status,
        "notes": notes,
    }
