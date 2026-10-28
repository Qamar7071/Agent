"""Destination data, loaded once from shared/destinations.json (the single source of truth
that the website and the database seed also use).

Nothing in here is live: prices are indicative, distances approximate, and road or
weather status always comes from the live services at request time.
"""
import json
import re
from functools import lru_cache

import config
from clock import today_pk

LOWLAND_ORIGINS = {"Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar"}

# Overnight hubs that have curated stay options (hub key -> destination id in "stays").
HUB_STAYS = {"hunza": "hunza", "attabad": "attabad", "passu": "passu", "sost": "khunjerab", "skardu": "skardu",
             "fairy-meadows": "fairy-meadows", "askole": "k2", "trek-camp": "k2"}

_HUB_NAMES = {"islamabad": "Islamabad", "rawalpindi": "Rawalpindi", "lahore": "Lahore", "karachi": "Karachi",
              "peshawar": "Peshawar", "gilgit": "Gilgit", "chilas": "Chilas", "sost": "Sost",
              "raikot-bridge": "Raikot Bridge", "askole": "Askole", "hunza": "Karimabad (Hunza)",
              "attabad": "Attabad Lake", "passu": "Passu", "skardu": "Skardu",
              "trek-camp": "Trek camp (with your operator)"}


@lru_cache(maxsize=1)
def dataset() -> dict:
    with open(config.SHARED_DATA, encoding="utf-8") as f:
        return json.load(f)


def destinations() -> dict[str, dict]:
    return {d["id"]: d for d in dataset()["destinations"]}


def destination(did: str) -> dict | None:
    return destinations().get(did)


def route_order() -> list[str]:
    return dataset()["route_order"]


def coords(key: str) -> tuple[float, float] | None:
    d = destination(key)
    if d:
        return d["coords"]["lat"], d["coords"]["lng"]
    h = dataset()["hubs"].get(key)
    return (h["lat"], h["lng"]) if h else None


def origin_key(name: str) -> str:
    return dataset()["origins"].get(name, "islamabad")


def origins() -> list[str]:
    return list(dataset()["origins"].keys())


def leg(a: str, b: str) -> dict | None:
    for item in dataset()["legs"]:
        if (item["from"], item["to"]) in ((a, b), (b, a)):
            return item
    return None


def stays(did: str) -> dict | None:
    return dataset()["stays"].get(did)


def stays_for_hub(hub: str) -> tuple[str | None, dict | None]:
    did = HUB_STAYS.get(hub)
    return did, (stays(did) if did else None)


def place_name(key: str) -> str:
    """Human name for a destination id or hub key."""
    if key in _HUB_NAMES:
        return _HUB_NAMES[key]
    d = destination(key)
    return d["name"] if d else key.replace("-", " ").title()


def cost_model() -> dict:
    return dataset()["cost_model"]


def seasonal_routes() -> list[dict]:
    return dataset()["seasonal_routes"]


def season_of(month: int) -> str:
    if month == 12 or month <= 2:
        return "winter"
    if month <= 5:
        return "spring"
    if month <= 8:
        return "summer"
    return "autumn"


def season_note(month: int | None = None) -> str:
    m = month or today_pk().month
    return dataset()["season_notes"][season_of(m)]


@lru_cache(maxsize=1)
def _alias_patterns() -> list[tuple[str, re.Pattern]]:
    out = []
    for d in dataset()["destinations"]:
        words = sorted({*d["aliases"], d["name"].lower()}, key=len, reverse=True)
        alt = "|".join(re.escape(w) for w in words)
        out.append((d["id"], re.compile(rf"(?<![a-z0-9])(?:{alt})(?![a-z0-9])")))
    return out


def match_destinations(text: str) -> list[str]:
    """Destination ids mentioned in free text (names, villages, landmarks), as whole words."""
    t = (text or "").lower()
    return [did for did, pattern in _alias_patterns() if pattern.search(t)]


def resolve_destination(value: str) -> str | None:
    """Accept an id ("fairy-meadows"), a name ("Fairy Meadows") or an alias ("Karimabad")."""
    if not value:
        return None
    v = str(value).strip().lower()
    if destination(v):
        return v
    slug = v.replace(" ", "-")
    if destination(slug):
        return slug
    hits = match_destinations(v)
    return hits[0] if hits else None
