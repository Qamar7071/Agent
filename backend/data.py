"""Curated Northern Pakistan travel data (Python mirror of the frontend data).
Facts are stable general knowledge. Nothing here is live — weather comes from
Open-Meteo at request time, and prices are indicative ranges, not live quotes.
"""

DESTINATIONS = {
    "hunza": {
        "name": "Hunza Valley", "region": "Hunza · Karimabad", "altitude": 2500,
        "ll": (36.3167, 74.6667), "stay": 3, "duration": (3, 6),
        "best_months": [4, 5, 6, 7, 8, 9, 10, 11],
        "tagline": "Forts, orchards and a ring of 7,000-metre peaks",
        "access": "Fly Islamabad → Gilgit (weather-dependent), then ~2 h by road; or a 1–2 day KKH drive.",
        "season_note": "April blossom and late-October colours are the classic windows.",
        "highlights": ["Baltit Fort", "Altit Fort", "Eagle's Nest sunset", "Rakaposhi viewpoint"],
        "nearby": ["attabad", "passu", "khunjerab"],
        "day_plans": [
            {"title": "Karimabad & the forts", "activities": ["Baltit Fort guided visit", "Walk the old bazaar lanes", "Altit Fort and royal garden"]},
            {"title": "Eagle's Nest & viewpoints", "activities": ["Sunrise/sunset at Eagle's Nest (Duikar)", "Rakaposhi viewpoint", "Local Hunza food"]},
            {"title": "Slow day in the valley", "activities": ["Orchard walk", "Handicraft shops", "Golden-hour photography"]},
        ],
    },
    "skardu": {
        "name": "Skardu & Upper Kachura", "region": "Baltistan · Skardu", "altitude": 2228,
        "ll": (35.2971, 75.6333), "stay": 3, "duration": (3, 5),
        "best_months": [4, 5, 6, 7, 8, 9, 10],
        "tagline": "Glass-still lakes in a cold desert",
        "access": "Fly Islamabad → Skardu (weather-dependent, keep a buffer day); or a long 1–2 day KKH + Jaglot–Skardu drive.",
        "season_note": "Summer is green and busy; autumn is calm, clear and cooler.",
        "highlights": ["Upper Kachura Lake", "Shangrila", "Shigar Fort", "Katpana cold desert"],
        "nearby": ["deosai", "k2"],
        "day_plans": [
            {"title": "Kachura lakes", "activities": ["Boat ride on Upper Kachura Lake", "Lunch by Shangrila", "Katpana cold desert at sunset"]},
            {"title": "Shigar Valley", "activities": ["Shigar Fort and gardens", "Village walk along the Shigar River", "Skardu bazaar"]},
            {"title": "Waterfalls & villages", "activities": ["Day trip to Manthokha waterfall", "Kharmang viewpoints"]},
        ],
    },
    "attabad": {
        "name": "Attabad Lake", "region": "Gojal · Upper Hunza", "altitude": 2560,
        "ll": (36.3486, 74.8603), "stay": 1, "duration": (1, 2),
        "best_months": [4, 5, 6, 7, 8, 9, 10],
        "tagline": "Turquoise water born from a mountain",
        "access": "About 30–45 min from Karimabad on the KKH, through the lakeside tunnels.",
        "season_note": "The colour is brightest on clear summer days.",
        "highlights": ["Boat ride", "Lakeside viewpoints", "Gulmit village"],
        "nearby": ["hunza", "passu"],
        "day_plans": [{"title": "Attabad & Gulmit", "activities": ["Boat ride along the cliffs", "Lakeside lunch", "Gulmit village"]}],
    },
    "fairy-meadows": {
        "name": "Fairy Meadows", "region": "Diamer · Raikot", "altitude": 3300,
        "ll": (35.3869, 74.5744), "stay": 2, "duration": (2, 4),
        "best_months": [6, 7, 8, 9],
        "tagline": "Pine meadows under Nanga Parbat",
        "access": "Jeep from Raikot Bridge towards Tato, then a 2–3 h hike. Use local registered drivers.",
        "season_note": "Snow closes the meadow in winter; June–September is the season.",
        "highlights": ["Nanga Parbat view", "Beyal Camp walk", "Night-sky photography"],
        "nearby": ["hunza", "skardu"],
        "day_plans": [
            {"title": "Raikot to Fairy Meadows", "activities": ["Jeep from Raikot Bridge", "Hike to the meadow", "Evening view of Nanga Parbat"]},
            {"title": "Beyal Camp walk", "activities": ["Hike towards Beyal Camp", "Reflection lake at sunrise", "Stargazing"]},
        ],
    },
    "deosai": {
        "name": "Deosai National Park", "region": "Baltistan · Astore", "altitude": 4114,
        "ll": (34.9667, 75.4167), "stay": 1, "duration": (1, 2),
        "best_months": [6, 7, 8, 9],
        "tagline": "The plateau they call the land of giants",
        "access": "Jeep from Skardu via Sadpara Lake, ~2–3 h. Nights are cold even in summer.",
        "season_note": "Open roughly June–September; snow closes it the rest of the year.",
        "highlights": ["Sheosar Lake", "Bara Pani", "Wildflower season"],
        "nearby": ["skardu"],
        "day_plans": [{"title": "Deosai plateau", "activities": ["Jeep via Sadpara Lake", "Bara Pani and the plains", "Sheosar Lake", "Back to Skardu before dark"]}],
    },
    "passu": {
        "name": "Passu & Gojal", "region": "Gojal · Upper Hunza", "altitude": 2400,
        "ll": (36.4667, 74.8833), "stay": 1, "duration": (1, 3),
        "best_months": [4, 5, 6, 7, 8, 9, 10],
        "tagline": "Cathedral spires and a swaying bridge",
        "access": "About 1 h north of Karimabad on the KKH, past Attabad Lake.",
        "season_note": "Autumn apricot-and-poplar colours make October special.",
        "highlights": ["Passu Cones", "Hussaini bridge", "Borith Lake", "Passu Glacier"],
        "nearby": ["attabad", "khunjerab", "hunza"],
        "day_plans": [
            {"title": "Passu Cones & Hussaini", "activities": ["Passu Cones viewpoint", "Hussaini suspension bridge", "Borith Lake"]},
            {"title": "Glacier walk", "activities": ["Hike towards Passu Glacier", "Apricot orchards", "Sunset on the Cones"]},
        ],
    },
    "khunjerab": {
        "name": "Khunjerab Pass", "region": "Hunza · Pak–China border", "altitude": 4693,
        "ll": (36.8469, 75.4267), "stay": 1, "duration": (1, 1),
        "best_months": [5, 6, 7, 8, 9, 10],
        "tagline": "The highest paved border crossing on Earth",
        "access": "A day trip from Passu or Sost on the KKH. National-park entry at the checkpoint.",
        "season_note": "Seasonal — typically open late spring to late autumn. Confirm before you go.",
        "highlights": ["Pak–China border gate", "Khunjerab National Park", "Wildlife"],
        "nearby": ["passu", "attabad"],
        "day_plans": [{"title": "Up to Khunjerab", "activities": ["Early start from Passu", "Khunjerab National Park", "Border gate at 4,693 m — keep the stop short", "Back to Gojal"]}],
    },
    "k2": {
        "name": "K2 Base Camp & Concordia", "region": "Baltoro · Karakoram", "altitude": 5150,
        "ll": (35.8808, 76.5133), "stay": 14, "duration": (14, 21),
        "best_months": [6, 7, 8],
        "tagline": "The throne room of the mountain gods",
        "access": "From Skardu by jeep to Askole, then on foot. Needs a trekking permit and a registered operator.",
        "season_note": "A short summer window, June–August.",
        "highlights": ["Baltoro Glacier", "Trango Towers", "Concordia", "K2 Base Camp"],
        "nearby": ["skardu"],
        "day_plans": [
            {"title": "Skardu → Askole", "activities": ["Jeep through the Braldu gorge", "Gear and permit check"]},
            {"title": "The Baltoro Glacier", "activities": ["Paiju, Urdukas, Goro camps", "Trango Towers and Masherbrum"]},
            {"title": "Concordia & K2 Base Camp", "activities": ["Sunrise on K2 and Broad Peak", "Walk to K2 Base Camp"]},
        ],
    },
}

ROUTE_ORDER = ["fairy-meadows", "skardu", "deosai", "k2", "hunza", "attabad", "passu", "khunjerab"]

ALIASES = {
    "hunza": ["hunza", "karimabad", "baltit", "altit", "eagle"],
    "skardu": ["skardu", "kachura", "shangrila", "shigar", "katpana", "baltistan"],
    "attabad": ["attabad", "atabad", "ataabad", "gulmit"],
    "fairy-meadows": ["fairy", "meadows", "nanga", "raikot", "beyal"],
    "deosai": ["deosai", "sheosar", "deosi"],
    "passu": ["passu", "pasu", "hussaini", "borith", "gojal", "tupopdan"],
    "khunjerab": ["khunjerab", "sost", "border"],
    "k2": ["k2", "concordia", "baltoro", "askole"],
}

COORDS = {
    **{k: v["ll"] for k, v in DESTINATIONS.items()},
    "islamabad": (33.6844, 73.0479), "rawalpindi": (33.5651, 73.0169),
    "lahore": (31.5204, 74.3587), "karachi": (24.8607, 67.0011), "peshawar": (34.0151, 71.5249),
    "gilgit": (35.9208, 74.3080), "chilas": (35.4206, 74.0953), "sost": (36.6667, 74.855),
    "raikot-bridge": (35.389, 74.579), "askole": (35.6814, 75.8158),
}

ORIGIN_KEY = {"Islamabad": "islamabad", "Rawalpindi": "rawalpindi", "Lahore": "lahore",
              "Karachi": "karachi", "Peshawar": "peshawar", "Gilgit": "gilgit", "Skardu": "skardu"}

SLEEP_HUB = {"hunza": "hunza", "attabad": "attabad", "passu": "passu", "khunjerab": "sost",
             "skardu": "skardu", "deosai": "skardu", "fairy-meadows": "fairy-meadows", "k2": "askole"}

CLUSTER_GATEWAY = {"hunza": "gilgit", "attabad": "gilgit", "passu": "gilgit", "khunjerab": "gilgit",
                   "skardu": "skardu", "deosai": "skardu", "fairy-meadows": "raikot-bridge", "k2": "skardu"}

# Curated accurate approximate road legs: (km, (min_h, max_h), note)
LEGS = {
    "islamabad>chilas": (460, (10, 12), "Karakoram Highway via Besham (or Babusar Top in summer)."),
    "chilas>gilgit": (130, (3, 4), "KKH along the Indus."),
    "chilas>skardu": (230, (6, 7), "Jaglot–Skardu road along the Indus gorge."),
    "gilgit>skardu": (210, (6, 7), "Jaglot–Skardu road."),
    "gilgit>hunza": (100, (2.5, 3), "KKH north to Karimabad."),
    "hunza>attabad": (20, (0.75, 1), "KKH through the lakeside tunnels."),
    "attabad>passu": (25, (0.75, 1), "KKH past Gulmit."),
    "passu>sost": (35, (1, 1.25), "KKH to the last town before the border."),
    "sost>khunjerab": (85, (2.5, 3), "KKH climb into Khunjerab National Park."),
    "passu>khunjerab": (120, (3.5, 4), "KKH via Sost to the Pak–China border."),
    "skardu>deosai": (60, (2.5, 3), "Jeep via Sadpara Lake onto the plateau."),
    "skardu>askole": (120, (6, 7), "Rough jeep track through the Braldu gorge."),
    "raikot-bridge>fairy-meadows": (15, (1.5, 2.5), "Narrow jeep track from the KKH, then a 2–3 h hike."),
    "hunza>skardu": (290, (7, 9), "Back down the KKH to Gilgit, then the Skardu road."),
    "gilgit>chilas": (130, (3, 4), "KKH south along the Indus."),
}

STAYS = {
    "hunza": {"base": "Karimabad", "options": [
        {"name": "Hunza Serena Inn", "tier": "Premium", "from": 22000, "to": 38000},
        {"name": "Eagle's Nest Hotel (Duikar)", "tier": "View", "from": 14000, "to": 26000},
        {"name": "Hunza Darbar Hotel", "tier": "Mid-range", "from": 8000, "to": 15000},
        {"name": "Karimabad guesthouses", "tier": "Budget", "from": 3500, "to": 7000}], "note": None},
    "skardu": {"base": "Skardu", "options": [
        {"name": "Shangrila Resort (Lower Kachura)", "tier": "Premium", "from": 20000, "to": 40000},
        {"name": "Byarsa / Summit Alpine Hotel", "tier": "Mid-range", "from": 9000, "to": 16000},
        {"name": "PTDC Motel Skardu", "tier": "Mid-range", "from": 8000, "to": 14000},
        {"name": "Guesthouses near the bazaar", "tier": "Budget", "from": 3500, "to": 7000}], "note": None},
    "attabad": {"base": "Gojal / lakeside", "options": [
        {"name": "Luxus Hunza Attabad Lake", "tier": "Premium", "from": 30000, "to": 55000},
        {"name": "Attabad Lake view guesthouses", "tier": "Mid-range", "from": 8000, "to": 16000}], "note": None},
    "fairy-meadows": {"base": "Fairy Meadows (seasonal)", "options": [
        {"name": "Fairy Meadows Cottages", "tier": "Cabins", "from": 8000, "to": 18000},
        {"name": "Raikot Sarai", "tier": "Cabins", "from": 7000, "to": 15000},
        {"name": "Wooden huts / camping", "tier": "Budget", "from": 3000, "to": 6000}],
        "note": "Open roughly June–September only; book cottages ahead in summer."},
    "deosai": {"base": "No hotels — camping", "options": [
        {"name": "Organised camping (Bara Pani / Sheosar)", "tier": "Camp", "from": 4000, "to": 9000}],
        "note": "Deosai has no hotels. Most visitors day-trip from Skardu or camp with an operator."},
    "passu": {"base": "Passu / Gulmit", "options": [
        {"name": "Passu Tourist Lodge", "tier": "Mid-range", "from": 7000, "to": 13000},
        {"name": "Borith Lake Hotel", "tier": "View", "from": 8000, "to": 15000},
        {"name": "Gulmit guesthouses", "tier": "Budget", "from": 3500, "to": 7000}], "note": None},
    "khunjerab": {"base": "Stay at Sost", "options": [
        {"name": "Sost town hotels (nearest beds)", "tier": "Mid-range", "from": 6000, "to": 12000}],
        "note": "Khunjerab Pass is a day trip — no beds at the top. Sleep at Sost or Passu."},
    "k2": {"base": "Camping / trek", "options": [
        {"name": "Expedition camping (operator-arranged)", "tier": "Camp", "from": 0, "to": 0}],
        "note": "The Baltoro trek is fully camping-based through a licensed operator."},
}

COST_MODEL = {
    "flight_pp_oneway": 30000, "vehicle_per_day": 18000, "bus_pp_per_leg": 3500,
    "excursion_jeep": 12000, "room_per_night": 10000, "room_sleeps": 2,
    "camp_pp_night": 4500, "food_pp_day": 2500,
    "entries": {"deosai": 500, "khunjerab": 800},
}

COST_ASSUMPTIONS = [
    "Flights: PKR 30,000 per person each way (Islamabad ↔ Skardu/Gilgit, weather-dependent)",
    "Private 4×4: PKR 18,000 per day for the whole vehicle",
    "Rooms: PKR 10,000 per night, 2 sharing (camping PKR 4,500 per person)",
    "Food: PKR 2,500 per person per day",
    "Jeep excursions (Deosai, Fairy Meadows): PKR 12,000 each",
    "National-park entry where applicable (Deosai, Khunjerab)",
]

SEASON_NOTES = {
    "winter": "Deep winter — high plateaus, passes and treks are closed by snow. Skardu and Hunza towns stay reachable; flights are weather-dependent.",
    "spring": "Blossom season — apricot and cherry flower in Hunza and Skardu while high routes are still thawing.",
    "summer": "Peak season — every road and trek is open (Deosai, Fairy Meadows, Khunjerab, Baltoro). Book stays early.",
    "autumn": "Golden season — clear skies, gold poplars, thinner crowds; high routes begin closing by late autumn.",
}


def season_of(month: int) -> str:
    if month == 12 or month <= 2:
        return "winter"
    if month <= 5:
        return "spring"
    if month <= 8:
        return "summer"
    return "autumn"
