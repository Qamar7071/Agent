"""One-off migration (already done): merged the destination facts that used to live in three
places (src/data/destinations.js, src/data/logistics.js, backend/data.py) into one dataset,
shared/destinations.json, used by the backend and the website.

Since then, shared/destinations.json is the file to edit. Run `npm run test:api` afterwards:
backend/tests/test_data.py checks sources, review dates, labels and the road graph. This
script is kept as a record of where each value came from.

Input: a JSON dump of the old frontend modules (made with node) whose values are taken
as-is. Nothing new is invented here: fields we could not verify are labelled as such.

Usage: python scripts/build_shared_data.py dump.json > shared/destinations.json
"""
import json
import sys

REVIEWED = "2026-10-27"

# General reference pages (checked to exist on 2026-10-27). They support the descriptive
# facts (location, altitude band, seasonality); they are not live sources.
SOURCES = {
    "hunza": [("Wikipedia: Hunza Valley", "https://en.wikipedia.org/wiki/Hunza_Valley")],
    "skardu": [("Wikipedia: Skardu", "https://en.wikipedia.org/wiki/Skardu")],
    "attabad": [("Wikipedia: Attabad Lake", "https://en.wikipedia.org/wiki/Attabad_Lake")],
    "fairy-meadows": [("Wikipedia: Fairy Meadows", "https://en.wikipedia.org/wiki/Fairy_Meadows")],
    "deosai": [("Wikipedia: Deosai National Park", "https://en.wikipedia.org/wiki/Deosai_National_Park")],
    "passu": [("Wikipedia: Passu", "https://en.wikipedia.org/wiki/Passu")],
    "khunjerab": [("Wikipedia: Khunjerab Pass", "https://en.wikipedia.org/wiki/Khunjerab_Pass")],
    "k2": [("Wikipedia: K2", "https://en.wikipedia.org/wiki/K2"),
           ("Wikipedia: Baltoro Glacier", "https://en.wikipedia.org/wiki/Baltoro_Glacier")],
}
GENERAL = [("Gilgit-Baltistan Tourism Department", "https://tourismdept.gbit.gov.pk"),
           ("Wikipedia: Karakoram Highway", "https://en.wikipedia.org/wiki/Karakoram_Highway")]

BAD_WEATHER = {
    "hunza": "If it rains: visit Baltit and Altit forts (indoor rooms) and Karimabad's cafés and craft shops; skip high viewpoints.",
    "skardu": "If it rains: Shigar Fort and Skardu bazaar; avoid boat rides and the Deosai road.",
    "attabad": "If it rains or the wind is strong: skip the boat ride and stay in Gulmit's village lanes and cafés.",
    "fairy-meadows": "If it rains: stay at the meadow camp and skip the Beyal walk; do not attempt the jeep track during heavy rain.",
    "deosai": "If rain, snow or low cloud: postpone the plateau and use the day in Skardu; the plateau is exposed and cold.",
    "passu": "If it rains: skip the Hussaini bridge and glacier walk; visit Gulmit's cultural spots instead.",
    "khunjerab": "If snow or storms are forecast: do not drive to the pass; stay lower in Gojal and try another day.",
    "k2": "Weather days are built into expedition plans; follow your licensed operator and guide.",
}

# Practical, conservative accessibility notes (what the trip physically involves).
ACCESS_NOTES = {
    "hunza": "Town base with road access; forts involve stairs and steep lanes.",
    "skardu": "Town base with road and airport access; lake shores are uneven.",
    "attabad": "Roadside lake on the KKH; boat rides need a step down onto the boat.",
    "fairy-meadows": "Jeep track then a 2–3 hour uphill hike; not suitable for wheelchairs or people who cannot hike.",
    "deosai": "High plateau (about 4,100 m) reached by jeep; no facilities; cold nights.",
    "passu": "Roadside village; the Hussaini bridge is a swaying plank bridge, not suitable for everyone.",
    "khunjerab": "Drive-up border pass at about 4,700 m; thin air, keep stops short.",
    "k2": "Multi-week glacier trek with permits and an operator; for fit, experienced trekkers only.",
}

VISIT_COSTS = {
    "deosai": [{"item": "National park entry (per person, local rate)", "pkr": 500}],
    "khunjerab": [{"item": "National park entry (per person, local rate)", "pkr": 800}],
}

ALIASES = {   # matched as whole words, so keep them specific (no "altitude" matching "altit")
    "hunza": ["hunza", "karimabad", "baltit", "altit", "eagle's nest", "eagles nest", "duikar"],
    "skardu": ["skardu", "kachura", "shangrila", "shangri-la", "shigar", "katpana"],
    "attabad": ["attabad", "atabad", "ataabad", "gulmit"],
    "fairy-meadows": ["fairy meadows", "fairy meadow", "fairy", "nanga parbat", "raikot", "beyal"],
    "deosai": ["deosai", "sheosar", "deosi"],
    "passu": ["passu", "pasu", "hussaini", "borith", "gojal", "tupopdan"],
    "khunjerab": ["khunjerab", "sost", "china border", "pak-china border"],
    "k2": ["k2", "concordia", "baltoro", "askole"],
}

SLEEP_HUB = {"hunza": "hunza", "attabad": "attabad", "passu": "passu", "khunjerab": "sost",
             "skardu": "skardu", "deosai": "skardu", "fairy-meadows": "fairy-meadows", "k2": "askole"}

# Season notes reworded so they describe the usual pattern, never a live status.
SEASON_NOTES = {
    "winter": "Deep winter. High plateaus, passes and treks are usually closed by snow. Skardu and Hunza towns usually stay "
              "reachable, but flights are weather-dependent and the KKH can close after heavy snowfall.",
    "spring": "Blossom season. Apricot and cherry trees flower in Hunza and Skardu while high routes are still thawing and "
              "often closed.",
    "summer": "Peak season. High routes such as Deosai, Fairy Meadows, Khunjerab and the Baltoro are usually open, but "
              "monsoon rain can bring landslides: check road status before you travel and book stays early.",
    "autumn": "Golden season. Poplars and orchards turn gold, skies are often clear and crowds thin out. High routes "
              "begin closing from late autumn.",
}

# Extra legs. The first two are derived from the dataset's own figures (Chilas–Skardu 230 km
# passes Raikot Bridge, about 50 km from Chilas); the others link lowland cities to Islamabad.
# All approximate.
EXTRA_LEGS = [
    {"from": "chilas", "to": "raikot-bridge", "km": 50, "hours": [1, 1.5], "note": "KKH along the Indus."},
    {"from": "raikot-bridge", "to": "skardu", "km": 180, "hours": [5, 6],
     "note": "KKH to the Jaglot junction, then the Jaglot–Skardu road."},
    {"from": "lahore", "to": "islamabad", "km": 375, "hours": [4.5, 5.5], "note": "M-2 motorway."},
    {"from": "peshawar", "to": "islamabad", "km": 180, "hours": [2, 2.5], "note": "M-1 motorway."},
    {"from": "karachi", "to": "islamabad", "km": 1400, "hours": [18, 22],
     "note": "Long-distance motorway and highway route via Sukkur, Multan and Lahore; most travellers fly."},
]

# Approximate town elevations, used for the road profile on the home page.
HUB_ALTITUDES = {"islamabad": 540, "rawalpindi": 510, "chilas": 1265, "gilgit": 1500, "sost": 2800}

# Seasonal routes: typical pattern only (not live status). Used to warn, never to promise.
SEASONAL_ROUTES = [
    {"id": "khunjerab-pass", "name": "Khunjerab Pass (KKH, Sost–border)", "typical_open_months": [5, 6, 7, 8, 9, 10],
     "note": "The border crossing is seasonal and usually closed in winter; exact opening and closing dates are announced each year."},
    {"id": "babusar-top", "name": "Babusar Top (Naran–Chilas road)", "typical_open_months": [6, 7, 8, 9, 10],
     "note": "Closed by snow for much of the year; the KKH via Besham is the all-season alternative."},
    {"id": "deosai-road", "name": "Deosai plateau roads (Skardu–Sadpara–Deosai)", "typical_open_months": [6, 7, 8, 9],
     "note": "Snow closes the plateau outside summer."},
    {"id": "fairy-meadows-track", "name": "Raikot Bridge–Tato jeep track (Fairy Meadows)", "typical_open_months": [6, 7, 8, 9],
     "note": "Narrow track; snow and rockfall close it outside the summer season."},
]


def main(path):
    old = json.load(open(path, encoding="utf-8"))
    dests = []
    for d in old["destinations"]:
        did = d["id"]
        lat, lng = old["coords"][did]
        dests.append({
            "id": did,
            "name": d["name"],
            "region": d["region"],
            "province": "Gilgit-Baltistan",
            "category": d["category"],
            "tagline": d["tagline"],
            "description": d["description"],
            "altitude_m": d["altitude"],
            "altitude_note": "Approximate elevation of the visited area.",
            "coords": {"lat": lat, "lng": lng, "precision": "approximate area centre",
                       "verified": False, "note": "Good enough for weather and map links; not for navigation."},
            "recommended_days": {"min": d["duration"]["min"], "max": d["duration"]["max"], "default": d["stay"]},
            "best_months": d["bestMonths"],
            "season_note": d["seasonNote"],
            "access": d["access"],
            "accessibility": ACCESS_NOTES[did],
            "bad_weather_alternative": BAD_WEATHER[did],
            "highlights": d["highlights"],
            "nearby": d["nearby"],
            "day_plans": d["dayPlans"],
            "visit_costs": [{**c, "status": "estimate", "verified": False} for c in VISIT_COSTS.get(did, [])],
            "aliases": ALIASES[did],
            "sleep_hub": SLEEP_HUB[did],
            "sources": [{"label": l, "url": u} for l, u in SOURCES[did] + GENERAL],
            "last_reviewed": REVIEWED,
            "record_status": "curated",
            "record_note": "Curated travel guide content. Descriptive facts only: no live prices, road status or opening dates.",
        })

    legs = []
    for key, v in old["legs"].items():
        a, b = key.split(">")
        item = {"from": a, "to": b, "km": v["km"], "hours": v["hours"], "note": v["note"],
                "status": "approximate", "verified": False}
        if (a, b) == ("raikot-bridge", "fairy-meadows"):
            item["mode"] = "jeep"
            item["hike_hours"] = [2, 3]      # the walk up from the jeep track's end
        if (a, b) == ("skardu", "askole"):
            item["mode"] = "jeep"
        if (a, b) == ("askole", "k2"):
            item["mode"] = "trek"
        legs.append(item)
    for extra in EXTRA_LEGS:
        legs.append({**extra, "status": "approximate", "verified": False})

    stays = {}
    for did, s in old["stays"].items():
        stays[did] = {
            "base": s["base"],
            "note": s.get("note"),
            "options": [{**o, "price_status": "indicative range, not a quote", "verified": False} for o in s["options"]],
            "price_note": "Indicative PKR per room-night from Raahi's original dataset. Not live, not verified, no review date: "
                          "confirm the current price and availability with the property.",
        }

    cm = old["costModel"]
    out = {
        "meta": {
            "version": 2,
            "last_reviewed": REVIEWED,
            "note": "Single source of truth for destination facts, used by the API, the website and the database seed. "
                    "Values marked verified=false are curated approximations. Nothing here is live data.",
        },
        "destinations": dests,
        "route_order": old["routeOrder"],
        "season_notes": SEASON_NOTES,
        "hubs": {k: {"lat": v[0], "lng": v[1], **({"altitude_m": HUB_ALTITUDES[k], "altitude_note": "approximate"}
                                                   if k in HUB_ALTITUDES else {})}
                 for k, v in old["coords"].items() if k not in {x["id"] for x in dests}},
        "origins": old["originCoord"],
        "cluster_gateway": old["clusterGateway"],
        "legs": legs,
        "seasonal_routes": SEASONAL_ROUTES,
        "stays": stays,
        "cost_model": {
            "flight_pp_oneway": cm["flightPerPersonOneWay"],
            "vehicle_per_day": cm["vehiclePerDay"],
            "bus_pp_per_leg": cm["busPerPersonPerLeg"],
            "excursion_jeep": cm["excursionJeep"],
            "room_per_night": cm["roomPerNight"],
            "room_sleeps": cm["roomSleeps"],
            "camp_pp_night": cm["campPerPersonNight"],
            "food_pp_day": cm["foodPerPersonDay"],
            "entries": cm["entries"],
            "guide_per_day": cm["guidePerDay"],
            "contingency_pct": 10,
            "room_per_night_by_tier": {"budget": 5000, "mid": 10000, "premium": 25000},
            "vehicle_seats": 4,
            "jeep_seats": 5,
            "local_transport_per_day": 6000,
            "activities_pp_day": 1000,
            "child_food_factor": 0.6,
            "tier_note": "Room rates by stay level are planning assumptions (budget guesthouse, mid-range hotel, premium hotel), not quotes.",
            "status": "Indicative assumptions for planning. Not live prices.",
        },
        "general_sources": [{"label": l, "url": u} for l, u in GENERAL],
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])
