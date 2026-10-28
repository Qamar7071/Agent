"""Route information between two places.

Two independent figures, each labelled with where it comes from:
- curated: Raahi's approximate road distance and realistic mountain drive time
  (shared/destinations.json, verified=False).
- osrm: distance and free-flow drive time from the OSRM routing engine on OpenStreetMap
  data (public demo server, fair use). OSRM does not know about closures, checkposts or
  slow mountain driving, so its time is a lower bound.
Plus a Google Maps directions link the traveller can open for live traffic.
"""
import logging
import math

import config
import data
from services import http

log = logging.getLogger("raahi.routing")


def resolve_place(value: str) -> str | None:
    """Destination id, hub key ("gilgit", "chilas") or origin city name ("Islamabad")."""
    if not value:
        return None
    v = str(value).strip()
    did = data.resolve_destination(v)
    if did:
        return did
    low = v.lower().replace(" ", "-")
    if data.coords(low):
        return low
    origins = {k.lower(): key for k, key in data.dataset()["origins"].items()}
    return origins.get(v.lower())


def maps_link(a: str, b: str) -> str | None:
    ca, cb = data.coords(a), data.coords(b)
    if not ca or not cb:
        return None
    return (f"https://www.google.com/maps/dir/?api=1&origin={ca[0]},{ca[1]}"
            f"&destination={cb[0]},{cb[1]}&travelmode=driving")


def _haversine(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def curated(a: str, b: str) -> dict | None:
    item = data.leg(a, b)
    if item:
        return {"km": item["km"], "hours": item["hours"], "note": item["note"],
                "status": "approximate (curated)", "verified": False}
    ca, cb = data.coords(a), data.coords(b)
    if not ca or not cb:
        return None
    km = round(_haversine(ca, cb) * 1.5 / 5) * 5
    h = km / 35
    return {"km": km, "hours": [max(1, int(h)), math.ceil(h * 1.2)],
            "note": "Rough estimate from straight-line distance (no curated figure for this pair).",
            "status": "rough estimate", "verified": False}


def osrm(a: str, b: str) -> dict:
    ca, cb = data.coords(a), data.coords(b)
    if not ca or not cb:
        return {"available": False, "reason": "No coordinates for one of the places."}
    if not config.ROUTING_ENABLED:
        return {"available": False, "reason": "The routing engine is switched off on this server."}

    def go():
        try:
            url = f"{config.OSRM_URL}/route/v1/driving/{ca[1]},{ca[0]};{cb[1]},{cb[0]}"
            j = http.get(url, params={"overview": "false"}).json()
            route = j["routes"][0]
        except Exception as exc:
            log.warning("OSRM failed %s->%s: %s", a, b, exc)
            return {"available": False, "reason": "The routing engine could not be reached right now."}
        return {"available": True, "km": round(route["distance"] / 1000), "free_flow_hours": round(route["duration"] / 3600, 1),
                "source": "OSRM routing engine (OpenStreetMap data)", "source_url": "https://project-osrm.org/",
                "retrieved_at": http.now_iso(),
                "note": "Free-flow time on mapped roads. Real mountain journeys take longer and closures are not included."}

    return http.cached(f"osrm:{a}:{b}", 86400, go)


def route_info(origin: str, destination: str) -> dict:
    a, b = resolve_place(origin), resolve_place(destination)
    if not a or not b:
        missing = origin if not a else destination
        return {"available": False, "reason": f"I don't have location data for '{missing}'."}
    if a == b:
        return {"available": False, "reason": "Start and end are the same place."}
    return {"available": True, "from": a, "to": b, "curated": curated(a, b), "routing_engine": osrm(a, b),
            "maps_url": maps_link(a, b),
            "advice": "Plan mountain drives in daylight and keep buffer time; check road status on the morning you travel."}
