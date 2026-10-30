"""Packing Intelligence Agent: a checklist built from the trip's places, season, forecast and activities.

Rules are deterministic and every item says why it is there. When there is a live forecast the
list uses its temperatures; otherwise it uses altitude and season and says the basis is
"typical conditions, not a forecast". A Travel Twin scenario (e.g. heavy snowfall) adds the gear
that scenario would need.
"""
from agents.base import Agent, AgentResult
from agents.common import plan_of, travel_hours
import data


def _item(name, category, priority, why):
    return {"name": name, "category": category, "priority": priority, "why": why}


def checklist(plan: dict, weather: dict | None, scenario: dict | None = None) -> dict:
    req = plan["request"]
    dests = [data.destination(d) for d in req["destinations"] if data.destination(d)]
    max_alt = max([d["altitude_m"] for d in dests] or [0])
    month = int(req["start_date"][5:7]) if req.get("start_date") else req.get("travel_month")
    day_w = (weather or {}).get("day_weather") or []
    lows = [w["min_c"] for w in day_w if w.get("min_c") is not None]
    rain = any((w.get("rain_mm") or 0) >= 5 or (w.get("rain_chance_pct") or 0) >= 50 for w in day_w)
    snow = any((w.get("snow_cm") or 0) > 0 for w in day_w)
    basis = "forecast" if day_w else "typical conditions, not a forecast"
    if scenario and scenario.get("type") == "heavy_snow":
        snow = True
        basis += " + snowfall scenario"
    winter = month in (11, 12, 1, 2, 3) if month else False
    coldest = min(lows) if lows else None
    freezing = (coldest is not None and coldest <= 0) or max_alt >= 4000 or (winter and max_alt >= 2000) or snow
    cold = freezing or (coldest is not None and coldest <= 8) or max_alt >= 2000
    trek = any(d["id"] in ("fairy-meadows", "k2") for d in dests)
    camping = any(s["hub"] in ("askole", "trek-camp") or s.get("destination_id") == "deosai" for s in plan["stays"])
    long_drive = any((m.get("hours") or [0, 0])[1] >= 8 for d in plan["days"] for m in d.get("moves", []))
    kids = req.get("children", 0) > 0
    monsoon = month in (7, 8) if month else False

    items = [
        _item("CNIC or passport, plus photocopies", "Documents", "essential", "Checkposts on the KKH ask for ID."),
        _item("Enough cash for the trip", "Money", "essential", "ATMs are few beyond Gilgit, Karimabad and Skardu, and often empty."),
        _item("Personal medicines and a basic first-aid kit", "Health and safety", "essential", "Pharmacies are far apart in the mountains."),
        _item("Power bank and charging cables", "Tech", "essential", "Power cuts are common in the north."),
        _item("Offline maps and this plan saved on your phone", "Tech", "essential", "Mobile signal drops on long stretches of road."),
        _item("Refillable water bottle", "Gear", "recommended", "Less plastic waste, and you can refill at hotels."),
        _item("Bag to carry your litter out", "Gear", "recommended", "Bins are rare at viewpoints and in parks."),
        _item("Torch or headlamp", "Gear", "recommended", "Power cuts, and dark paths at night."),
        _item("Comfortable walking shoes", "Clothing", "essential", "Forts, bazaars and viewpoints involve steep lanes."),
    ]
    if max_alt >= 2500:
        items.append(_item("Sunscreen (SPF 50) and sunglasses", "Health and safety", "essential",
                           f"UV is strong at {max_alt:,} m."))
    if max_alt >= 3500:
        items.append(_item("Ask a doctor about altitude sickness before the trip", "Health and safety", "essential",
                           f"You will be at about {max_alt:,} m; go up slowly and come down if symptoms appear."))
    if cold:
        why = f"Lows around {coldest:g} °C in the forecast." if coldest is not None else "Mountain nights are cold."
        items.append(_item("Warm jacket and layers", "Clothing", "essential", why))
    if freezing:
        items.append(_item("Gloves, warm hat and thermal underwear", "Clothing", "essential",
                           "Freezing temperatures are likely" + (" (forecast)." if lows else " at this altitude or season.")))
    if rain or monsoon or not day_w:
        items.append(_item("Rain jacket", "Clothing", "recommended" if not rain else "essential",
                           "Rain is forecast." if rain else ("Monsoon months bring showers." if monsoon
                                                              else "Mountain weather changes fast; no forecast yet.")))
    if snow:
        items.append(_item("Waterproof boots with good grip", "Clothing", "essential", "Snow and ice on paths."))
        if req.get("transport") == "car":
            items.append(_item("Confirm your driver carries snow chains", "Vehicle", "essential", "Snow on mountain roads."))
    if trek:
        items.append(_item("Broken-in trekking boots and a daypack", "Gear", "essential",
                           "The trip includes a hike or trek."))
        items.append(_item("Trekking poles", "Gear", "recommended", "Steep trails and glacier moraine."))
    if camping:
        items.append(_item("Warm sleeping bag", "Gear", "essential", "Nights in camps, often below freezing."))
    if long_drive:
        items.append(_item("Motion-sickness tablets and snacks", "Health and safety", "recommended",
                           "Long winding drives of 8+ hours."))
    if kids:
        items.append(_item("Children's medicines, snacks and warm clothes", "Health and safety", "essential",
                           "Travelling with children."))
    order = {"essential": 0, "recommended": 1, "optional": 2}
    items.sort(key=lambda i: (order[i["priority"]], i["category"]))
    lo, hi = travel_hours(plan)
    return {"items": items, "basis": basis, "conditions": {
        "max_altitude_m": max_alt, "coldest_forecast_c": coldest, "rain_forecast": rain, "snow": snow,
        "trek": trek, "camping": camping, "long_drives": long_drive, "travel_hours": [lo, hi]}}


class PackingAgent(Agent):
    name = "packing"
    label = "Packing Intelligence"
    description = "A checklist from the places, season, forecast and activities, with the reason for each item."
    depends_on = ("itinerary", "weather")

    def run(self, bb, tracer, tid):
        out = self.tool(tracer, tid, "rules.packing", checklist, plan_of(bb), bb.get("weather"), bb.scenario)
        essential = sum(1 for i in out["items"] if i["priority"] == "essential")
        return AgentResult(True, out, f"{len(out['items'])} items ({essential} essential), based on {out['basis']}",
                           confidence="high" if out["basis"] == "forecast" else "medium")
