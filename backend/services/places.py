"""Places to stay and eat in the towns where Raahi's plans stop overnight.

Two sources, never mixed up:

1. Raahi's curated stays (shared/destinations.json → stays): named places with an indicative
   PKR range per room-night from the original dataset. Not verified and not quotes, but they
   carry a range, so they can be matched against the traveller's per-night range.
2. Live listings from OpenStreetMap through the Overpass API (free, no key, data © OpenStreetMap
   contributors, ODbL): hotels, guest houses, hostels and campsites, or restaurants and cafés,
   with what the map records (type, stars, cuisine, phone, website). OpenStreetMap has no
   prices, so these are only grouped by the price level their *type* usually has, and every
   result says so. Nothing is invented: if the service can't be reached, the result says that.
"""
import logging
import math
import re
from urllib.parse import quote

import config
import data
from services import http

log = logging.getLogger("raahi.places")

SOURCE = "OpenStreetMap contributors (via the Overpass API)"
SOURCE_URL = "https://www.openstreetmap.org/copyright"
CACHE_S = 12 * 3600
MAX_RESULTS = 25

# Towns where plans put travellers overnight: name, where the curated stays live, search radius.
TOWNS = {
    "hunza": {"name": "Karimabad (Hunza)", "stays": "hunza", "at": "hunza", "radius": 4000},
    "attabad": {"name": "Attabad Lake and Gulmit", "stays": "attabad", "at": "attabad", "radius": 7000},
    "passu": {"name": "Passu and Gulmit", "stays": "passu", "at": "passu", "radius": 7000},
    "sost": {"name": "Sost", "stays": "khunjerab", "at": "sost", "radius": 4000},
    "skardu": {"name": "Skardu", "stays": "skardu", "at": "skardu", "radius": 8000},
    "fairy-meadows": {"name": "Fairy Meadows", "stays": "fairy-meadows", "at": "fairy-meadows", "radius": 3000},
    "deosai": {"name": "Deosai (camping only)", "stays": "deosai", "at": "deosai", "radius": 15000},
    "gilgit": {"name": "Gilgit", "stays": None, "at": "gilgit", "radius": 5000},
    "chilas": {"name": "Chilas", "stays": None, "at": "chilas", "radius": 4000},
}
TOWN_ALIASES = {"khunjerab": "sost", "raikot-bridge": "fairy-meadows", "karimabad": "hunza", "gulmit": "passu"}
NO_LISTINGS = {"k2": "On the K2 trek you sleep in camps arranged by your licensed operator; there are no hotels.",
               "askole": "Askole has only basic camping and rest houses, arranged by your trek operator.",
               "trek-camp": "Trek camps are arranged by your licensed operator."}

STAY_TYPES = {"hotel": "Hotel", "guest_house": "Guest house", "hostel": "Hostel", "motel": "Motel",
              "camp_site": "Campsite", "chalet": "Chalet", "apartment": "Apartment", "alpine_hut": "Mountain hut"}
FOOD_TYPES = {"restaurant": "Restaurant", "cafe": "Café", "fast_food": "Fast food", "food_court": "Food court"}
GROUP_LABEL = {"budget": "budget", "mid": "mid-range", "premium": "premium"}


def resolve_town(value: str | None) -> str | None:
    """Town key for a destination id, hub or name ('Hunza', 'skardu', 'Sost', 'karimabad')."""
    if not value:
        return None
    v = str(value).strip().lower().replace(" ", "-")
    v = TOWN_ALIASES.get(v, v)
    if v in TOWNS or v in NO_LISTINGS:
        return v
    did = data.resolve_destination(str(value))
    if did:
        return TOWN_ALIASES.get(did, did)
    return None


def _centre(town: str) -> tuple[float, float] | None:
    return data.coords(TOWNS[town]["at"])


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# ── Price levels ─────────────────────────────────────────────────────────────────

def bands() -> dict:
    return {k: v for k, v in data.cost_model()["room_bands"].items() if k in GROUP_LABEL}


def groups_for_range(lo: int | None, hi: int | None) -> list[str]:
    """Stay levels whose usual per-night band overlaps the traveller's range."""
    if lo is None and hi is None:
        return []
    lo, hi = lo or 0, hi if hi is not None else math.inf
    out = []
    for name, (b_lo, b_hi) in bands().items():
        if b_lo < hi and (b_hi is None or b_hi > lo):
            out.append(name)
    return out


def _stars(tags: dict) -> int | None:
    m = re.match(r"\s*(\d)", tags.get("stars", ""))
    return int(m.group(1)) if m and 1 <= int(m.group(1)) <= 5 else None


def _usual_groups(kind: str, stars: int | None) -> list[str] | None:
    """Price levels a place of this type usually has. None when the type says nothing useful."""
    if kind in ("hostel", "camp_site", "alpine_hut"):
        return ["budget"]
    if kind == "guest_house":
        return ["budget", "mid"]
    if kind in ("motel", "chalet", "apartment"):
        return ["mid"]
    if kind == "hotel" and stars:
        return ["premium"] if stars >= 4 else ["mid"]
    return None                      # a hotel without stars can be anything from cheap to premium


# ── OpenStreetMap ────────────────────────────────────────────────────────────────

def _query(kind: str, lat: float, lng: float, radius: int) -> str:
    if kind == "stay":
        sel = f'nwr["tourism"~"^({"|".join(STAY_TYPES)})$"]["name"](around:{radius},{lat},{lng});'
    else:
        sel = f'nwr["amenity"~"^({"|".join(FOOD_TYPES)})$"]["name"](around:{radius},{lat},{lng});'
    return f"[out:json][timeout:20];({sel});out center tags 120;"


def _overpass(query: str, quick: bool = False) -> list[dict]:
    last: Exception | None = None
    for url in (config.OVERPASS_URLS[:1] if quick else config.OVERPASS_URLS):
        try:
            r = http.post(url, data={"data": query}, timeout=6 if quick else 10)
            return r.json().get("elements", [])
        except Exception as exc:  # busy or down: try the next public server
            last = RuntimeError(f"{url.split('/')[2]}: {type(exc).__name__} {str(exc)[:80]}")
            log.warning("Overpass failed at %s: %s", url, exc)
    raise last or RuntimeError("no Overpass server")


def _website(tags: dict) -> str | None:
    w = (tags.get("website") or tags.get("contact:website") or "").strip()
    if w and not re.match(r"https?://", w) and re.match(r"[\w.-]+\.[a-z]{2,}(/|$)", w, re.I):
        w = "https://" + w
    return w[:200] if re.match(r"https?://[^\s\"'<>]+$", w) else None


def _parse(el: dict, kind: str, centre: tuple[float, float], town_name: str) -> dict | None:
    tags = el.get("tags") or {}
    name = (tags.get("name:en") or tags.get("name") or "").strip()
    if not name:
        return None
    key = tags.get("tourism") if kind == "stay" else tags.get("amenity")
    types = STAY_TYPES if kind == "stay" else FOOD_TYPES
    if key not in types:
        return None
    lat = el.get("lat", (el.get("center") or {}).get("lat"))
    lng = el.get("lon", (el.get("center") or {}).get("lon"))
    place = {
        "name": name[:120],
        "type": types[key],
        "type_key": key,
        "phone": (tags.get("phone") or tags.get("contact:phone") or "").strip()[:40] or None,
        "website": _website(tags),
        "address": ", ".join(x for x in (tags.get("addr:street"), tags.get("addr:city")) if x)[:120] or None,
        "distance_km": round(_km(centre, (lat, lng)), 1) if lat is not None and lng is not None else None,
        "osm_url": f"https://www.openstreetmap.org/{el.get('type', 'node')}/{el.get('id')}",
        "maps_url": "https://www.google.com/maps/search/?api=1&query=" + quote(f"{name}, {town_name}"),
    }
    if kind == "stay":
        place["stars"] = _stars(tags)
        place["usual_levels"] = _usual_groups(key, place["stars"])
    else:
        place["cuisine"] = [c.strip().replace("_", " ") for c in re.split(r"[;,]", tags.get("cuisine", "")) if c.strip()][:4]
    return place


def _live(town: str, kind: str, quick: bool = False) -> dict:
    if not config.PLACES_ENABLED:
        return {"available": False, "reason": "Live place listings are switched off on this server."}
    centre = _centre(town)
    if not centre:
        return {"available": False, "reason": "No location is recorded for this town."}
    t = TOWNS[town]

    def fetch():
        try:
            elements = _overpass(_query(kind, centre[0], centre[1], t["radius"]), quick)
        except Exception as exc:
            return {"available": False, "reason": "OpenStreetMap could not be reached just now. Try again in a "
                                                  "minute, or use the map links below.",
                    "detail": f"{type(exc).__name__}: {str(exc)[:160]}"}
        seen, places = set(), []
        for el in elements:
            p = _parse(el, kind, centre, t["name"])
            if p and p["name"].lower() not in seen:
                seen.add(p["name"].lower())
                places.append(p)
        places.sort(key=lambda p: (p["distance_km"] is None, p["distance_km"] or 0))
        return {"available": True, "source": SOURCE, "source_url": SOURCE_URL, "retrieved_at": http.now_iso(),
                "radius_km": round(t["radius"] / 1000, 1), "count": len(places), "places": places[:MAX_RESULTS]}

    return http.cached(f"places:{kind}:{town}", CACHE_S, fetch)


def _check_links(town: str, kind: str) -> list[dict]:
    name = TOWNS[town]["name"]
    if kind == "stay":
        return [{"label": f"Hotels near {name} on Google Maps",
                 "url": "https://www.google.com/maps/search/?api=1&query=" + quote(f"hotels in {name}")},
                {"label": f"Prices and availability on Booking.com",
                 "url": "https://www.booking.com/searchresults.html?ss=" + quote(f"{name}, Pakistan")}]
    return [{"label": f"Restaurants near {name} on Google Maps",
             "url": "https://www.google.com/maps/search/?api=1&query=" + quote(f"restaurants in {name}")}]


# ── Public ───────────────────────────────────────────────────────────────────────

def _no_listing(town: str, kind: str) -> dict:
    return {"town": town, "name": data.place_name(town), "kind": kind, "available": False,
            "message": NO_LISTINGS[town]}


def stays(town: str, min_pkr: int | None = None, max_pkr: int | None = None, quick: bool = False) -> dict:
    """Curated stays matched to a per-night range, plus live OpenStreetMap listings."""
    if town in NO_LISTINGS:
        return _no_listing(town, "stay")
    t = TOWNS[town]
    if min_pkr is not None and max_pkr is not None and min_pkr > max_pkr:
        min_pkr, max_pkr = max_pkr, min_pkr
    has_range = min_pkr is not None or max_pkr is not None
    lo, hi = min_pkr or 0, max_pkr if max_pkr is not None else math.inf
    wanted = groups_for_range(min_pkr, max_pkr)

    curated = None
    stay = data.stays(t["stays"]) if t["stays"] else None
    if stay:
        options = []
        for o in stay["options"]:
            opt = dict(o)
            priced = bool(o.get("to"))
            opt["in_range"] = (o["from"] <= hi and o["to"] >= lo) if (has_range and priced) else None
            opt["maps_url"] = "https://www.google.com/maps/search/?api=1&query=" + quote(f"{o['name']}, {t['name']}")
            options.append(opt)
        if has_range:
            options.sort(key=lambda o: (o["in_range"] is not True, o.get("from") or 0))
        curated = {"base": stay["base"], "options": options, "price_note": stay["price_note"]}

    live = _live(town, "stay", quick)
    if live.get("available") and has_range:
        live = dict(live)
        marked = []
        for p in live["places"]:
            p = dict(p)
            levels = p.get("usual_levels")
            p["fit"] = "unknown" if not levels else ("usually" if set(levels) & set(wanted) else "unlikely")
            marked.append(p)
        order = {"usually": 0, "unknown": 1, "unlikely": 2}
        live["places"] = sorted(marked, key=lambda p: (order[p["fit"]], p["distance_km"] or 0))

    out = {"town": town, "name": t["name"], "kind": "stay", "available": True,
           "range": {"min": min_pkr, "max": max_pkr} if has_range else None,
           "levels_in_range": [GROUP_LABEL[g] for g in wanted], "curated": curated, "live": live,
           "check_prices": _check_links(town, "stay"),
           "note": "Curated prices are indicative ranges per room-night, not quotes. OpenStreetMap lists real "
                   "places but no prices, so they are grouped only by the price level their type usually has. "
                   "Confirm the price and availability with the place before you pay."}
    if town == "deosai":
        out["note"] = "Deosai has no hotels: only seasonal camps. " + out["note"]
    return out


def food(town: str) -> dict:
    """Dishes commonly served in the area, plus live OpenStreetMap restaurants and cafés."""
    if town in NO_LISTINGS:
        res = _no_listing(town, "food")
        res["dishes"] = _dishes(town)
        return res
    t = TOWNS[town]
    return {"town": town, "name": t["name"], "kind": "food", "available": True, "dishes": _dishes(town),
            "live": _live(town, "food"), "check_prices": _check_links(town, "food"),
            "note": "OpenStreetMap lists places that exist on the map; it does not say whether they are open "
                    "this season. Many places in the north close in winter."}


def _dishes(town: str) -> dict | None:
    lf = data.dataset().get("local_food") or {}
    key = (lf.get("town_area") or {}).get(town) or (lf.get("town_area") or {}).get(TOWNS.get(town, {}).get("stays") or "")
    area = (lf.get("areas") or {}).get(key or "")
    if not area:
        return None
    return {"area": area["name"], "dishes": area["dishes"], "status": lf.get("status")}
