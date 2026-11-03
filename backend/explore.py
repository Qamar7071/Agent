"""Trip explorer: "Where can we go with this budget and these days?"

Like a flight site's "Everywhere" search, but for road trips north. For each trip idea (one
place, or places that are usually combined on one road), the real planner builds the plan
with the traveller's origin, days, group and month, and the cheapest comfortable way that
fits the budget is kept. Every number is the planner's estimate, never a quote; season fit
comes from the guide's typical months, never from a forecast or a road status.
"""
from __future__ import annotations

import planner
import data
from money import rs
from schemas import ExploreIn, TripRequest

# Trip ideas: places usually done together on one route. Order is the planner's job.
IDEAS = [
    ("hunza",), ("skardu",), ("hunza", "attabad"), ("hunza", "attabad", "passu"),
    ("hunza", "attabad", "khunjerab"), ("hunza", "attabad", "passu", "khunjerab"),
    ("skardu", "deosai"), ("fairy-meadows",), ("fairy-meadows", "hunza"), ("hunza", "skardu"),
    ("skardu", "deosai", "hunza"), ("k2",),
]

# Most comfortable first; the first that fits the budget is used.
VARIANTS = [("car", "mid"), ("car", "budget"), ("bus", "mid"), ("bus", "budget")]
VARIANT_WORDS = {("car", "mid"): "hired car, mid-range stays", ("car", "budget"): "hired car, budget stays",
                 ("bus", "mid"): "public coaches, mid-range stays", ("bus", "budget"): "public coaches, budget stays",
                 ("flight", "mid"): "flying north, mid-range stays", ("flight", "budget"): "flying north, budget stays",
                 ("car", "premium"): "hired car, premium stays"}

INTEREST_CATEGORY = {"lakes": {"lakes"}, "mountains": {"high", "valleys"}, "culture": {"culture"},
                     "trekking": {"treks"}, "photography": {"valleys", "lakes", "high"},
                     "relaxation": {"lakes", "valleys"}, "family": {"valleys", "lakes"}, "nature": {"lakes", "high"},
                     "stargazing": {"high"}, "food": {"culture"}}
HARD = {"fairy-meadows", "k2", "deosai", "khunjerab"}     # hikes, jeep tracks or very high ground
# The photo for an idea: its most distinctive place, so combined trips don't all show the same valley.
PHOTO_ORDER = ["khunjerab", "deosai", "passu", "attabad", "fairy-meadows", "k2", "skardu", "hunza"]


def _season(dests: list[str], month: int | None) -> dict:
    if not month:
        return {"verdict": "any", "closed": [], "off": []}
    closed, off = [], []
    for did in dests:
        route = _route_for(did)
        if route and month not in route["typical_open_months"]:
            closed.append(did)
        elif month not in data.destination(did)["best_months"]:
            off.append(did)
    return {"verdict": "closed" if closed else "off" if off else "best", "closed": closed, "off": off}


_ROUTE_FOR = {"khunjerab": "khunjerab-pass", "deosai": "deosai-road", "fairy-meadows": "fairy-meadows-track"}


def _route_for(did: str) -> dict | None:
    rid = _ROUTE_FOR.get(did)
    return next((r for r in data.seasonal_routes() if r["id"] == rid), None)


def _name(did: str) -> str:
    d = data.destination(did)
    return d["name"] if d else data.place_name(did)


def _names(ids: list[str]) -> str:
    n = [_name(i) for i in ids]
    return n[0] if len(n) == 1 else ", ".join(n[:-1]) + " and " + n[-1]


def _request(q: ExploreIn, dests: tuple[str, ...], transport: str, stay: str) -> TripRequest:
    return TripRequest(origin=q.origin, destinations=list(dests), days=q.days, adults=q.adults, children=q.children,
                       budget_pkr=q.budget_pkr, budget_basis=q.budget_basis, transport=transport,
                       accommodation=stay, start_date=q.start_date, travel_month=None if q.start_date else q.month,
                       interests=q.interests, pace="relaxed" if q.style == "easy" else "balanced",
                       accessibility=["limited_mobility"] if q.style == "easy" and q.limited_walking else [])


def _try(q: ExploreIn, dests: tuple[str, ...]) -> dict | None:
    """Build the idea in each way, most comfortable first; keep the first that fits the budget and the days."""
    tried = []
    ways = list(VARIANTS)
    for transport, stay in ways + [("flight", "mid"), ("flight", "budget")]:
        try:
            req = _request(q, dests, transport, stay)
            plan = planner.build(req, with_savings=False)
        except Exception:          # an idea the planner can't build (e.g. no road leg): skip it
            continue
        b = plan["budget"]
        status = b["comparison"]["status"]
        tried.append((transport, stay, req, plan))
        fits_days = plan["feasibility"]["ok"]
        if fits_days and status in ("within", "no_budget"):
            return {"transport": transport, "stay": stay, "req": req, "plan": plan, "fits_budget": True}
    if not tried:
        return None
    feasible = [t for t in tried if t[3]["feasibility"]["ok"]] or tried
    transport, stay, req, plan = min(feasible, key=lambda t: t[3]["budget"]["total"])
    status = plan["budget"]["comparison"]["status"]
    return {"transport": transport, "stay": stay, "req": req, "plan": plan, "fits_budget": status in ("within", "no_budget")}


def _score(q: ExploreIn, dests: tuple[str, ...], got: dict, season: dict) -> tuple[float, list[str], list[str]]:
    plan, req = got["plan"], got["req"]
    b, f = plan["budget"], plan["feasibility"]
    good, bad = [], []
    score = 50.0
    status = b["comparison"]["status"]
    if q.budget_pkr:
        budget_total = q.budget_pkr * req.people if q.budget_basis == "per_person" else q.budget_pkr
        spare = budget_total - b["total"]
        if status == "within":
            score += 25
            good.append(f"Fits your budget with about {rs(spare)} to spare (estimate)." if spare > 0
                        else "Fits your budget (estimate).")
        elif status == "tight":
            score += 8
            bad.append(f"Just over your budget, by about {rs(-spare)} (estimate).")
        else:
            over = b["total"] / budget_total - 1 if budget_total else 1
            score -= min(50, 15 + 40 * over)          # a little over beats far over
            bad.append(f"About {rs(-spare)} over your budget, even the cheapest way (estimate).")
    if f["ok"]:
        score += 15
        spare_days = f["requested_days"] - f["minimum_days"]
        enough = f["travel_days"] + sum(data.destination(d)["recommended_days"]["max"] for d in dests)
        if q.days > enough + 1:
            idle = q.days - enough
            score -= min(20, 4 * idle)
            bad.append(f"More days than it needs: about {idle} free days. Add a place, or keep them as spare days.")
        elif spare_days >= 2:
            good.append(f"Unhurried: {spare_days} days more than the minimum.")
    else:
        score -= 30
        bad.append(f"Needs at least {f['minimum_days']} days from {q.origin}; you have {q.days}.")
    if season["verdict"] == "best":
        score += 15
        good.append(f"A good month for {'it' if len(dests) == 1 else 'all of them'}, typically.")
    elif season["verdict"] == "off":
        score -= 5
        bad.append(f"{_names(season['off'])}: outside the best months, typically.")
    elif season["verdict"] == "closed":
        score -= 60
        bad.append(f"Access to {_names(season['closed'])} is usually closed by snow then.")
    cats = {c for d in dests for c in data.destination(d)["category"]}
    hits = [i for i in q.interests if INTEREST_CATEGORY.get(i, set()) & cats]
    if hits:
        score += min(12, 4 * len(hits))
        good.append("Matches " + ", ".join(hits[:3]) + ".")
    if q.style == "easy":
        hard = [d for d in dests if d in HARD]
        if hard:
            score -= 12 * len(hard)
            bad.append(f"{_names(hard)}: hiking, jeep tracks or very high ground.")
    elif q.style == "adventure":
        score += 6 * sum(1 for d in dests if d in HARD)
    if "k2" in dests and q.days < 14:
        score -= 100                  # only for a multi-week trek
    travel = sum(1 for d in plan["days"] if d["type"] == "travel")
    if plan["days"] and travel / len(plan["days"]) > 0.6:
        score -= 8
        bad.append(f"{travel} of {len(plan['days'])} days are mostly on the road.")
    if got["transport"] == "flight":
        bad.append("Uses flights north, which are weather-dependent and often delayed or cancelled.")
    return score, good, bad


def explore(q: ExploreIn) -> dict:
    month = q.start_date.month if q.start_date else q.month
    out = []
    for dests in IDEAS:
        if "k2" in dests and q.days < 14:
            continue
        got = _try(q, dests)
        if not got:
            continue
        season = _season(list(dests), month)
        score, good, bad = _score(q, dests, got, season)
        plan, req = got["plan"], got["req"]
        travel = sum(1 for d in plan["days"] if d["type"] == "travel")
        out.append({
            "id": "+".join(dests), "destinations": list(dests), "title": plan["title"],
            "tagline": data.destination(min(dests, key=PHOTO_ORDER.index))["tagline"],
            "photo": min(dests, key=PHOTO_ORDER.index),
            "highlights": [h for d in dests for h in data.destination(d)["highlights"][:2]][:4],
            "days": len(plan["days"]), "travel_days": travel, "minimum_days": plan["feasibility"]["minimum_days"],
            "fits_days": plan["feasibility"]["ok"], "fits_budget": got["fits_budget"],
            "way": VARIANT_WORDS.get((got["transport"], got["stay"]), f"{got['transport']}, {got['stay']} stays"),
            "transport": got["transport"], "accommodation": got["stay"],
            "total": plan["budget"]["total"], "per_person": plan["budget"]["per_person"],
            "budget_status": plan["budget"]["comparison"]["status"],
            "season": {**season, "closed": [_name(d) for d in season["closed"]], "off": [_name(d) for d in season["off"]]},
            "max_altitude_m": max((data.destination(d).get("altitude_m") or 0) for d in dests),
            "score": round(score, 1), "good": good, "bad": bad,
            "request": req.model_dump(mode="json", exclude={"day_edits"}),
        })
    out.sort(key=lambda o: (-o["score"], o["total"]))
    return {
        "ideas": out[: q.limit],
        "considered": len(out),
        "month": month,
        "note": "Costs are Raahi's estimates for your group, not quotes. Seasons are typical patterns, not forecasts, "
                "and no road status is implied: check before you travel.",
    }
