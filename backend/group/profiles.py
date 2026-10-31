"""What group members can tell Raahi, and how it turns into one trip request.

Public profile (seen as totals only): interests, budget comfort, pace, must-do places, no-go.
Private comfort needs (optional): stored without a link to the member (see storage) and shown to
the group only as anonymous constraints, e.g. "1 member: avoid going above 4,000 m without an
acclimatisation day". Raahi never diagnoses: these are needs the member chooses to share.
"""
from collections import Counter

import data

TRIP_TYPES = {
    # default pace and stay level when members don't say; tone is used by the website
    "friends": {"pace": "balanced", "accommodation": "budget"},
    "family": {"pace": "relaxed", "accommodation": "mid"},
    "couple": {"pace": "balanced", "accommodation": "mid"},
    "solo": {"pace": "balanced", "accommodation": "budget"},
}
PACES = ["relaxed", "balanced", "active"]
COMFORT = {"tight": "budget", "medium": "mid", "comfortable": "premium"}
INTERESTS = ["mountains", "lakes", "culture", "food", "photography", "trekking", "relaxation", "family"]
NO_GO = ["long_drives", "high_altitude", "hikes", "camping", "early_starts"]
NEEDS = ["altitude", "breathing", "motion_sickness", "limited_walking", "food_vegetarian", "food_mild", "food_allergy"]
TREKS = {"fairy-meadows", "k2"}
HIGH_M = 4000
LONG_DRIVE_H = 8


def majority(values: list[str], order: list[str], default: str) -> str:
    """Most common value; a tie goes to the gentler or cheaper choice (earlier in `order`)."""
    if not values:
        return default
    counts = Counter(values)
    top = max(counts.values())
    return next(v for v in order if counts.get(v) == top)


def merge(base: dict, trip_type: str, profiles: list[dict], needs: dict[str, int]) -> dict:
    """The group's combined preferences as changes to the base trip request, with reasons."""
    t = TRIP_TYPES.get(trip_type, TRIP_TYPES["friends"])
    reasons = []
    pace = majority([p["pace"] for p in profiles if p.get("pace")], PACES, t["pace"])
    comfort = majority([p["budget_comfort"] for p in profiles if p.get("budget_comfort")],
                       ["tight", "medium", "comfortable"], None) if profiles else None
    stays = COMFORT[comfort] if comfort else t["accommodation"]
    if trip_type == "family" and stays == "budget":
        reasons.append("Family trip: budget stays kept, but check rooms for children before booking.")
    counts = Counter(i for p in profiles for i in p.get("interests", []))
    interests = [i for i, _ in counts.most_common(6)] or list(base.get("interests") or [])
    must = Counter(d for p in profiles for d in p.get("must_do", []) if data.destination(d))
    destinations = list(dict.fromkeys(list(base["destinations"]) + [d for d, _ in must.most_common()]))
    access = set(base.get("accessibility") or [])
    if needs.get("altitude") or needs.get("breathing"):
        access.add("altitude_sensitive")
        reasons.append("Someone needs a gentle climb: a full day at the base before going above 4,000 m.")
    if needs.get("limited_walking"):
        access.add("limited_mobility")
    if needs.get("breathing") or needs.get("limited_walking"):
        if pace == "active":
            pace = "balanced"
            reasons.append("Pace kept at balanced: someone needs easier days.")
    food = [w for k, w in (("food_vegetarian", "vegetarian"), ("food_mild", "mild food"),
                           ("food_allergy", "a food allergy: tell every hotel")) if needs.get(k)]
    no_go = Counter(x for p in profiles for x in p.get("no_go", []))
    return {
        "pace": pace, "accommodation": stays, "interests": interests, "destinations": destinations,
        "accessibility": sorted(access), "food": ", ".join(food) or base.get("food"),
        "no_go": dict(no_go), "must_do": dict(must), "reasons": reasons,
        "avoid_treks": bool(needs.get("breathing") or needs.get("limited_walking")),
    }


def constraint_list(rows: list[dict]) -> list[dict]:
    """Anonymous totals per need; a name appears only next to a need its owner chose to show it with."""
    out = {}
    for r in rows:
        c = out.setdefault(r["code"], {"code": r["code"], "count": 0, "names": []})
        c["count"] += 1
        if r.get("display_name"):
            c["names"].append(r["display_name"])
    return [out[k] for k in NEEDS if k in out]
