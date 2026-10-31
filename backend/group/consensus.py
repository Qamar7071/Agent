"""Group consensus: the agents propose 2–3 plans with clear trade-offs; members vote; the organizer decides.

Everything here is deterministic and explainable:
- Group Memory combines everyone's answers (majority pace and stay level, shared interests,
  must-do places) and the anonymous comfort needs.
- Predictive Safety turns needs into concerns (altitude, breathing, walking, long drives).
- Itinerary Planner builds each option with the real planner; Budget Intelligence prices it.
- The consensus step scores each option for each member and averages it into a "Group match"
  (0–100), lists what each option gives up, and recommends one. Members vote; the organizer confirms.

Each step records real events and messages (Tracer.say), which the "how the agents decided"
view shows. No member's name is attached to a need unless that member chose to show it.
"""
import time

import data
import planner
from agents.base import Tracer
from agents.safety_agent import assess
from group.profiles import HIGH_M, LONG_DRIVE_H, TREKS, merge
from money import rs
from schemas import TripRequest

KINDS = {"best": "Best match for the group", "gentle": "Gentler and lower", "budget": "Budget version",
         "fly": "Fly in, shorter drives", "relaxed": "More relaxed"}
def members(n: int) -> str:
    return f"{n} member" if n == 1 else f"{n} members"


WEIGHTS = {"pace": 0.2, "budget": 0.25, "interests": 0.2, "must_do": 0.2, "no_go": 0.15}
GENERIC_INTERESTS = {"food", "family", "relaxation"}
NEED_TEXT = {
    "altitude": "avoid going above 4,000 m without an acclimatisation day",
    "breathing": "breathing gets hard with effort: gentle days, no steep hikes",
    "motion_sickness": "gets motion sick: keep long winding drives short",
    "limited_walking": "limited walking: avoid long hikes and steep trails",
    "food_vegetarian": "vegetarian food", "food_mild": "mild food", "food_allergy": "a food allergy",
}


def _metrics(plan: dict) -> dict:
    days = plan["days"]
    moves = [m for d in days for m in d.get("moves", []) if m.get("mode") != "flight"]
    top = max((planner._day_top(d) for d in days), key=lambda x: x[1], default=(None, 0))
    acts = " ".join(a.lower() for d in days for a in d.get("activities", []))
    dests = [d for d in plan["request"]["destinations"]]
    first_high = next((i for i, d in enumerate(days) if planner._day_top(d)[1] >= HIGH_M), None)
    acclim = sum(1 for d in days[:first_high] if planner._full_day_at_altitude(d)) if first_high is not None else None
    return {
        "destinations": dests,
        "days": len(days),
        "acclim_days": acclim, "first_high_day": (first_high + 1) if first_high is not None else None,
        "max_alt": top[1], "max_alt_place": data.place_name(top[0]) if top[0] else None,
        "longest_drive_h": max((m["hours"][1] for m in moves), default=0),
        "drive_hours": sum(m["hours"][1] for m in moves),
        "early_start": any((m.get("timing") or {}).get("depart", "99") < "06:00" for m in moves),
        "treks": sorted(set(dests) & TREKS),
        "camping": "camp" in acts,
        "per_person": plan["budget"]["per_person"], "total": plan["budget"]["total"],
        "budget_status": plan["budget"]["comparison"]["status"],
        "budget_message": plan["budget"]["comparison"].get("message"),
        "transport": plan["request"]["transport"], "accommodation": plan["request"]["accommodation"],
        "pace": plan["request"]["pace"],
    }


def _member_score(p: dict, m: dict, cheapest: int, dearest: int) -> dict:
    parts = {}
    want = p.get("pace")
    parts["pace"] = 1.0 if not want or want == m["pace"] else (
        0.5 if abs(["relaxed", "balanced", "active"].index(want) - ["relaxed", "balanced", "active"].index(m["pace"])) == 1 else 0.0)
    r = (m["per_person"] - cheapest) / (dearest - cheapest) if dearest > cheapest else 0.0
    comfort = p.get("budget_comfort")
    parts["budget"] = 1 - r if comfort == "tight" else (1 - abs(r - 0.5) if comfort == "medium" else 1.0)
    wants = p.get("interests") or []
    if wants:
        hit = [i for i in wants if i in GENERIC_INTERESTS or any(planner._matches(d, [i]) for d in m["destinations"])]
        parts["interests"] = len(hit) / len(wants)
    else:
        parts["interests"] = 1.0
    must = [d for d in p.get("must_do", []) if data.destination(d)]
    parts["must_do"] = (sum(1 for d in must if d in m["destinations"]) / len(must)) if must else 1.0
    bad = 0
    no_go = set(p.get("no_go", []))
    bad += "high_altitude" in no_go and m["max_alt"] >= HIGH_M
    bad += "long_drives" in no_go and m["longest_drive_h"] >= LONG_DRIVE_H
    bad += "hikes" in no_go and bool(m["treks"])
    bad += "camping" in no_go and m["camping"]
    bad += "early_starts" in no_go and m["early_start"]
    parts["no_go"] = max(0.0, 1 - 0.5 * bad)
    parts["total"] = sum(WEIGHTS[k] * parts[k] for k in WEIGHTS)
    return parts


def _need_violations(needs: dict[str, int], m: dict) -> list[str]:
    out = []
    if needs.get("limited_walking") and m["treks"]:
        out.append(f"Doesn't suit {members(needs['limited_walking'])} with limited walking: "
                   f"{', '.join(data.place_name(t) for t in m['treks'])} needs a long hike.")
    if needs.get("breathing") and m["treks"]:
        out.append("Has a steep hike, which doesn't suit a member who asked for gentle days.")
    if needs.get("motion_sickness") and m["longest_drive_h"] >= LONG_DRIVE_H:
        out.append(f"Has drive days of up to {m['longest_drive_h']:g} hours, hard for a member who gets motion sick.")
    return out


def _sacrifices(m: dict, ref: dict | None, group_budget: int | None, must_do=()) -> list[str]:
    out = []
    if ref:
        gone = [d for d in ref["destinations"] if d not in m["destinations"] and d not in must_do]
        if gone:
            out.append("Skips " + ", ".join(f"{data.place_name(d)} ({data.destination(d)['altitude_m']:,} m)" for d in gone) + ".")
        dp = m["per_person"] - ref["per_person"]
        if dp > 0:
            out.append(f"Costs about {rs(dp)} more per person (estimate).")
        dh = m["drive_hours"] - ref["drive_hours"]
        if dh >= 2:
            out.append(f"About {dh:g} more hours on the road.")
        if m["accommodation"] != ref["accommodation"] and m["accommodation"] == "budget":
            out.append("Basic guesthouses instead of hotels.")
        if m["transport"] == "bus" and ref["transport"] != "bus":
            out.append("Public coaches: fixed times, less flexible.")
        if m["transport"] == "flight" and ref["transport"] != "flight":
            out.append("Northern flights are often cancelled by weather: keep a spare day.")
        if m["days"] > ref["days"]:
            extra = m["days"] - ref["days"]
            out.append(f"{extra} day{'s' if extra != 1 else ''} longer.")
    if group_budget and m["budget_status"] == "over":
        out.append(f"Over the group budget: {m['budget_message']}")
    return out


def _variant(req: TripRequest, **change) -> TripRequest:
    return TripRequest.model_validate({**req.model_dump(mode="json"), **change})


def propose(base_request: dict, trip_type: str, profiles: list[dict], needs: dict[str, int], emit=None) -> dict:
    tracer = Tracer(kind="group", emit=emit)
    orch = tracer.queue("orchestrator", "Master Orchestrator", "Find plans the whole group can agree on",
                        initiated_by="user")
    tracer.start(orch, {"members_answered": len(profiles), "needs": sum(needs.values()), "trip_type": trip_type})
    base = TripRequest.model_validate(base_request)

    mem = tracer.queue("memory", "Group Memory", "Combine everyone's answers", depends_on=[orch])
    tracer.start(mem, {"profiles": len(profiles)})
    merged = merge(base.model_dump(mode="json"), trip_type, profiles, needs)
    tracer.tool(mem, "group.merge", True, 0, f"pace {merged['pace']}, stays {merged['accommodation']}")
    paces = [p.get("pace") for p in profiles if p.get("pace")]
    tracer.say(mem, "proposal",
               f"{members(len(profiles))} answered. Pace: {merged['pace']}. Stays: {merged['accommodation']}. "
               + (f"Must-do: {', '.join(data.place_name(d) for d in merged['must_do'])}." if merged["must_do"] else "No must-do places."),
               reason="Majority pace and budget comfort; ties go to the gentler or cheaper choice.",
               evidence=[{"source": "Member answers", "detail": f"{paces.count(merged['pace'])} of {len(paces)} chose {merged['pace']}" if paces else "no pace given"},
                         {"source": "Trip type", "detail": trip_type}])
    tracer.finish(mem, {"pace": merged["pace"], "accommodation": merged["accommodation"]}, "Combined the group's answers")

    saf = tracer.queue("safety", "Predictive Safety", "Turn comfort needs into plan rules", depends_on=[mem])
    tracer.start(saf, {"needs": {k: v for k, v in needs.items() if v}})
    concerns = {}
    for code, n in needs.items():
        if not n:
            continue
        high = [d for d in merged["destinations"] if data.destination(d)["altitude_m"] >= HIGH_M]
        detail = NEED_TEXT[code]
        evidence = [{"source": "Group needs (anonymous)", "detail": f"{members(n)}: {detail}"}]
        if code in ("altitude", "breathing") and high:
            evidence.append({"source": "Destination data", "detail": ", ".join(f"{data.place_name(d)} about {data.destination(d)['altitude_m']:,} m" for d in high)})
        concerns[code] = tracer.say(saf, "concern", f"{members(n)}: {detail}.", reason="Shared privately, without names.",
                                    evidence=evidence)
    tracer.finish(saf, {"concerns": len(concerns)}, f"{len(concerns)} group need(s) turned into plan rules")

    itin = tracer.queue("itinerary", "Itinerary Planner", "Build the options", depends_on=[mem, saf])
    tracer.start(itin, {"destinations": merged["destinations"]})
    best_dests = [d for d in merged["destinations"] if not (merged["avoid_treks"] and d in TREKS)] or merged["destinations"]
    best = _variant(base, destinations=best_dests, pace=merged["pace"], accommodation=merged["accommodation"],
                    interests=merged["interests"], accessibility=merged["accessibility"], food=merged["food"])
    lowland = base.origin in data.LOWLAND_ORIGINS
    extras = []        # (relevance, kind, request): a need counts 3, each member's answer 1, being over budget 2
    if needs.get("altitude") or needs.get("breathing") or merged["no_go"].get("high_altitude"):
        low = [d for d in best.destinations if data.destination(d)["altitude_m"] < HIGH_M]
        if low and low != list(best.destinations):
            weight = 3 * (needs.get("altitude", 0) + needs.get("breathing", 0)) + merged["no_go"].get("high_altitude", 0)
            extras.append((weight, "gentle", _variant(best, destinations=low, pace="relaxed")))
    if (needs.get("motion_sickness") or merged["no_go"].get("long_drives")) and lowland and best.transport != "flight":
        weight = 3 * needs.get("motion_sickness", 0) + merged["no_go"].get("long_drives", 0)
        extras.append((weight, "fly", _variant(best, transport="flight")))
    tight = sum(1 for p in profiles if p.get("budget_comfort") == "tight")
    best_plan_total = planner.build(best, with_savings=False)["budget"]["total"]
    over = bool(base.budget_pkr) and best_plan_total > (base.budget_pkr * (base.adults + base.children)
                                                         if base.budget_basis == "per_person" else base.budget_pkr)
    cheap = _variant(best, accommodation="budget", transport="bus" if best.transport == "car" else best.transport)
    if (tight or over) and (cheap.accommodation, cheap.transport) != (best.accommodation, best.transport):
        extras.append((tight + 2 * over, "budget", cheap))
    if best.pace != "relaxed":
        extras.append((0, "relaxed", _variant(best, pace="relaxed")))
    extras.sort(key=lambda x: -x[0])
    candidates = [("best", best)] + [(k, r) for _, k, r in extras]
    left_out = [d for d in merged["destinations"] if d not in best.destinations]

    options, seen = [], set()
    for kind, req in candidates:
        key = (tuple(req.destinations), req.transport, req.accommodation, req.pace)
        if key in seen:
            continue
        seen.add(key)
        started = time.monotonic()
        plan = planner.build(req)
        tracer.tool(itin, f"planner.build({kind})", True, int((time.monotonic() - started) * 1000), plan["title"])
        m = _metrics(plan)
        why = [w["message"] for w in plan["warnings"] if w["code"] == "acclimatise"]
        options.append({"kind": kind, "request": plan["request"], "plan": plan, "m": m, "why": why})
        if len(options) == 3:
            break
    for d in left_out:
        wanted = merged["must_do"].get(d, 0)
        tracer.say(itin, "proposal",
                   f"{data.place_name(d)} is left out of option A: it needs a long hike, and a member asked for "
                   "gentle days." + (f" It was a must-do for {members(wanted)}." if wanted else ""),
                   evidence=[{"source": "Destination data", "detail": data.destination(d)["access"][:180]}],
                   resolves=concerns.get("breathing") or concerns.get("limited_walking"))
    for i, o in enumerate(options):
        o["id"] = "ABC"[i]
        msg = tracer.say(itin, "proposal",
                         f"Option {o['id']} ({KINDS[o['kind']]}): {o['m']['days']} days, {o['plan']['title']}, "
                         f"{o['m']['transport']}, {o['m']['accommodation']} stays.",
                         reason="; ".join(o["why"]) or None,
                         evidence=[{"source": "Raahi planner", "detail": f"longest drive {o['m']['longest_drive_h']:g} h, highest point "
                                    f"{o['m']['max_alt']:,} m"}],
                         resolves=concerns.get("altitude") or concerns.get("breathing") if o["why"] else None)
        o["message"] = msg
        need_alt = concerns.get("altitude") or concerns.get("breathing")
        if need_alt and not o["why"] and o["m"]["first_high_day"]:
            tracer.say(itin, "proposal",
                       f"Option {o['id']}: {o['m']['max_alt_place']} ({o['m']['max_alt']:,} m) comes on day "
                       f"{o['m']['first_high_day']}, after {o['m']['acclim_days']} full day{'s' if o['m']['acclim_days'] != 1 else ''} sleeping at 2,000 m or more: "
                       "the acclimatisation need is met.", resolves=need_alt,
                       evidence=[{"source": "Raahi planner", "detail": "rule: at least one full day at altitude first"}])
            o["why"].append(f"{o['m']['max_alt_place']} comes after {o['m']['acclim_days']} full day{'s' if o['m']['acclim_days'] != 1 else ''} at altitude.")
    tracer.finish(itin, {"options": len(options)}, f"Built {len(options)} options")

    bud = tracer.queue("budget", "Budget Intelligence", "Price each option", depends_on=[itin])
    tracer.start(bud, {"group_budget": base.budget_pkr})
    for o in options:
        if o["m"]["budget_status"] == "over" and base.budget_pkr:
            tracer.say(bud, "concern", f"Option {o['id']} is about {rs(o['m']['per_person'])} per person: {o['m']['budget_message']}",
                       evidence=[{"source": "Raahi cost model (estimate)", "detail": f"total {rs(o['m']['total'])}"}])
    tracer.finish(bud, {o["id"]: o["m"]["per_person"] for o in options}, "Priced every option (estimates)")

    con = tracer.queue("validation", "Consensus", "Score each option for each member", depends_on=[bud, saf])
    tracer.start(con, {"members": len(profiles)})
    pp = [o["m"]["per_person"] for o in options]
    ref = options[0]["m"]
    for o in options:
        risk = assess(o["plan"], None)["overall"]
        scores = [_member_score(p, o["m"], min(pp), max(pp)) for p in profiles] or [{"total": 1.0}]
        violations = _need_violations(needs, o["m"])
        match = round(100 * sum(s["total"] for s in scores) / len(scores)) - 15 * len(violations)
        n = len(profiles)
        fits = {
            "pace": sum(1 for s in scores if s.get("pace", 1) >= 0.99),
            "budget": sum(1 for s in scores if s.get("budget", 1) >= 0.66),
            "must_do": sum(1 for s in scores if s.get("must_do", 1) >= 0.99),
            "no_go": sum(1 for s in scores if s.get("no_go", 1) >= 0.99),
            "interests_pct": round(100 * sum(s.get("interests", 1) for s in scores) / max(1, len(scores))),
            "members": n,
        }
        missing = [f"Leaves out {data.place_name(d)}, a must-do for {members(merged['must_do'][d])}."
                   for d in merged["must_do"] if d not in o["m"]["destinations"]]
        o.update(match=max(0, min(100, match)), fits=fits, risk=risk,
                 sacrifices=violations + missing + _sacrifices(o["m"], None if o is options[0] else ref, base.budget_pkr,
                                                              merged["must_do"]))
    best_opt = max(options, key=lambda o: (o["match"], -o["m"]["per_person"]))
    tracer.say(con, "decision",
               f"Best fit: Option {best_opt['id']} ({KINDS[best_opt['kind']]}), Group match {best_opt['match']}/100. "
               "Members vote; the organizer confirms the final plan.",
               reason=f"Pace fits {best_opt['fits']['pace']} of {best_opt['fits']['members']}, budget suits "
                      f"{best_opt['fits']['budget']}, must-dos for {best_opt['fits']['must_do']}.",
               evidence=[{"source": "Group match", "detail": ", ".join(f"{o['id']}: {o['match']}" for o in options)}])
    tracer.finish(con, {"recommended": best_opt["id"]}, "Scored the options for every member")
    tracer.finish(orch, {"options": len(options), "recommended": best_opt["id"]},
                  "Proposed options; waiting for the group's vote", status="waiting_for_approval")

    public = []
    for o in options:
        public.append({
            "id": o["id"], "kind": o["kind"], "label": KINDS[o["kind"]], "request": o["request"],
            "title": o["plan"]["title"], "days": [{"day": d["day"], "title": d["title"]} for d in o["plan"]["days"]],
            "per_person": o["m"]["per_person"], "total": o["m"]["total"], "budget_status": o["m"]["budget_status"],
            "max_alt": o["m"]["max_alt"], "max_alt_place": o["m"]["max_alt_place"],
            "longest_drive_h": o["m"]["longest_drive_h"], "transport": o["m"]["transport"],
            "accommodation": o["m"]["accommodation"], "pace": o["m"]["pace"], "why": o["why"],
            "match": o["match"], "fits": o["fits"], "sacrifices": o["sacrifices"],
            "risk": {"category": o["risk"]["category"], "score": o["risk"]["score"]},
        })
    return {"options": public, "recommended": best_opt["id"], "reasons": merged["reasons"],
            "note": "Group match is Raahi's own score from members' answers; prices are estimates.",
            "run": tracer.summary(), "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
