"""Travel Research Agent: facts, seasonality, add-ons and alternatives for the chosen places.

Facts come from Raahi's reviewed destination guide (shared/destinations.json), each with its
sources and review date. There is no live web research unless a news key is configured, and
the result says so rather than implying it searched the web.
"""
import config
import data
from agents.base import Agent, AgentResult
from planner import MONTHS


def _months(ms: list[int]) -> str:
    return f"{MONTHS[ms[0] - 1]}–{MONTHS[ms[-1] - 1]}" if ms else "unknown"


def season_fit(did: str, month: int | None) -> str:
    if not month:
        return "unknown (no dates yet)"
    route = next((r for r in data.seasonal_routes() if did in r["id"] or did.split("-")[0] in r["id"]), None)
    if route and month not in route["typical_open_months"]:
        return f"usually closed in {MONTHS[month - 1]}"
    return "in season" if month in data.destination(did)["best_months"] else f"outside its usual season in {MONTHS[month - 1]}"


def alternatives_for(month: int | None, interests: list[str], exclude: set[str], limit: int = 3) -> list[dict]:
    out = []
    for d in data.destinations().values():
        if d["id"] in exclude:
            continue
        fit = season_fit(d["id"], month)
        if month and not fit.startswith("in season"):
            continue
        score = len(set(d["category"]) & set(interests or [])) + (1 if month else 0)
        out.append((score, d["id"]))
    out.sort(key=lambda x: -x[0])
    return [{"id": did, "name": data.destination(did)["name"], "why": data.destination(did)["tagline"],
             "season": season_fit(did, month)} for _, did in out[:limit]]


class ResearchAgent(Agent):
    name = "research"
    label = "Travel Research"
    description = "Destination facts, seasonality, nearby add-ons and alternatives, with sources."
    depends_on = ("memory",)
    soft_depends = ("memory",)

    def run(self, bb, tracer, tid):
        st = bb.state
        req = bb.request
        dests = list(req.destinations if req else st.destinations)
        month = (req.start_date.month if req and req.start_date else (req.travel_month if req else st.month))
        interests = list(req.interests if req else st.interests)

        if not dests:
            alts = self.tool(tracer, tid, "guide.search", alternatives_for, month, interests, set(), 4)
            return AgentResult(True, {"destinations": [], "suggestions": alts, "live_research": False},
                               f"No destination yet: suggested {', '.join(a['name'] for a in alts)}", confidence="medium")

        facts = []
        for did in dests:
            d = self.tool(tracer, tid, f"guide.destination({did})", data.destination, did)
            facts.append({
                "id": did, "name": d["name"], "altitude_m": d["altitude_m"], "best_months": _months(d["best_months"]),
                "season": season_fit(did, month), "access": d["access"], "accessibility": d["accessibility"],
                "highlights": d["highlights"][:4], "bad_weather_alternative": d.get("bad_weather_alternative"),
                "sources": d["sources"],
            })
        gateway = data.dataset()["cluster_gateway"]
        clusters = {gateway.get(d) for d in dests}
        add_ons = [{"id": d["id"], "name": d["name"], "season": season_fit(d["id"], month),
                    "extra_days": d["recommended_days"]["min"], "why": d["tagline"]}
                   for d in data.destinations().values()
                   if d["id"] not in dests and gateway.get(d["id"]) in clusters and d["id"] != "k2"]
        out_of_season = [f for f in facts if not f["season"].startswith(("in season", "unknown"))]
        alts = (self.tool(tracer, tid, "guide.search", alternatives_for, month, interests, set(dests))
                if out_of_season else [])
        reviewed = data.dataset()["meta"]["last_reviewed"]
        note = ("Facts from Raahi's reviewed guide (last reviewed " + reviewed + "). "
                + ("No live web research is configured." if not config.TAVILY_API_KEY else
                   "Road news is searched separately and shown as unverified."))
        parts = [f"{f['name']}: {f['season']}" for f in facts]
        return AgentResult(True, {"destinations": facts, "add_ons": add_ons[:3], "alternatives": alts,
                                  "out_of_season": [f["id"] for f in out_of_season], "live_research": False,
                                  "note": note, "data_reviewed": reviewed},
                           "; ".join(parts) + (f"; {len(add_ons[:3])} nearby add-ons" if add_ons else ""),
                           confidence="high" if month else "medium",
                           sources=[s for f in facts for s in f["sources"]])
