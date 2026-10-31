"""What each agent says in the "how the agents decided" conversation.

Every message is written from the agent's own result in this run (numbers, places, sources),
attached to its real step, and marked as a proposal, a concern or a decision. Nothing here is a
fixed script: an agent with nothing to report says nothing, and a failed agent says it failed.
"""
import logging

import data
from agents.common import plan_of
from money import rs

log = logging.getLogger("raahi.agents")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


def _names(ids) -> str:
    names = [data.place_name(i) for i in ids]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1] if names else ""


def _month(req) -> int | None:
    return req.start_date.month if req.start_date else req.travel_month


def speak(name: str, out: dict, bb, tracer, tid: str) -> None:
    """Add this agent's messages. Never raises: the conversation must not break a run."""
    try:
        _SPEAK.get(name, lambda *a: None)(out, bb, tracer, tid)
    except Exception:          # pragma: no cover - defensive
        log.debug("voice for %s failed", name, exc_info=True)


def _remember(bb, key: str, mid: str) -> str:
    bb.hints.setdefault("msg", {})[key] = mid
    return mid


def _memory(out, bb, tracer, tid):
    st = out.get("state") or {}
    dests = st.get("destinations") or []
    if not dests:
        tracer.say(tid, "concern", "I don't know where you want to go yet, so I asked the research agent for ideas.")
        return
    people = (st.get("adults") or 0) + (st.get("children") or 0)
    month = int(st["start_date"][5:7]) if st.get("start_date") else st.get("month")
    budget = (f", budget {rs(st['budget_pkr'])} {'per person' if st.get('budget_basis') == 'per_person' else 'in total'}"
              if st.get("budget_pkr") else "")
    when = f", in {MONTHS[month - 1]}" if month else ""
    days = f"{st['days']} days" if st.get("days") else "a trip"
    who = f", {people} {'person' if people == 1 else 'people'}" if people else ""
    tracer.say(tid, "proposal", f"Understood: {days}{' from ' + st['origin'] if st.get('origin') else ''} to "
               f"{_names(dests)}{who}{when}{budget}.",
               evidence=[{"source": "Your message", "detail": "you told me: " + ", ".join(out.get("stated_now", [])[:6])}])
    if out.get("missing"):
        tracer.say(tid, "concern", f"Still unknown: {', '.join(out['missing'])}. I used sensible defaults and will say which.")


def _research(out, bb, tracer, tid):
    month = _month(bb.request)
    off = out.get("out_of_season") or []
    if off and month:
        d = data.destination(off[0])
        _remember(bb, "season", tracer.say(
            tid, "concern", f"{_names(off)} {'is' if len(off) == 1 else 'are'} usually out of season in {MONTHS[month - 1]}.",
            evidence=[{"source": "Raahi guide (typical pattern)", "detail": (d or {}).get("season_note", "")[:180]}]))
    elif month:
        tracer.say(tid, "proposal", f"All places are usually in season in {MONTHS[month - 1]}.",
                   evidence=[{"source": "Raahi guide (typical pattern)", "detail": "best months per place"}])
    if out.get("alternatives"):
        alt = out["alternatives"][0]
        label = alt.get("name") or data.place_name(alt.get("id", "")) if isinstance(alt, dict) else data.place_name(alt)
        tracer.say(tid, "proposal", f"In season instead: {label}.", resolves=bb.hints.get("msg", {}).get("season"))


def _itinerary(out, bb, tracer, tid):
    plan = out.get("plan")
    if not plan:
        return
    days = plan["days"]
    travel = sum(1 for d in days if d["type"] == "travel")
    longest = max((m["hours"][1] for d in days for m in d.get("moves", []) if m.get("mode") != "flight"), default=0)
    tracer.say(tid, "proposal", f"{len(days)} days: {travel} mainly for travel, {len(days) - travel} to explore"
               + (f"; the longest drive is up to {longest:g} hours." if longest else "."),
               evidence=[{"source": "Raahi planner", "detail": "curated road legs, daylight-timed departures"}])
    f = plan["feasibility"]
    if not f["ok"]:
        _remember(bb, "too_short", tracer.say(
            tid, "concern", f"{f['requested_days']} days is too short for this route: it needs at least {f['minimum_days']}.",
            evidence=[{"source": "Raahi planner", "detail": f"about {f['travel_days']} days of travel alone"}]))
    for w in plan.get("warnings", []):
        if w["code"] == "acclimatise":
            tracer.say(tid, "proposal", w["message"], evidence=[{"source": "Raahi planner", "detail": "altitude rule"}])


def _weather(out, bb, tracer, tid):
    if not out.get("available"):
        tracer.say(tid, "concern", f"No forecast was used: {out.get('reason') or 'unavailable'} Typical seasonal patterns only.",
                   evidence=[{"source": "Open-Meteo", "detail": "forecasts reach about 16 days ahead"}])
    else:
        impacts = out.get("impacts") or []
        for imp in impacts[:2]:
            _remember(bb, f"wx{imp['day']}", tracer.say(
                tid, "concern", f"Day {imp['day']} ({imp['date']}): {imp['risks'][0]}",
                reason=f"Bad-weather idea: {imp['alternative']}" if imp.get("alternative") else None,
                evidence=[{"source": "Open-Meteo forecast", "detail": imp.get("plan", "")}]))
        if not impacts:
            tracer.say(tid, "proposal", f"Forecast checked for {len(out.get('day_weather', []))} plan day(s): no severe weather.",
                       evidence=[{"source": "Open-Meteo forecast", "detail": "model forecast, not observations"}])
    alerts = (out.get("alerts") or {}).get("items") or []
    live = [a for a in alerts if a.get("active")]
    if live:
        tracer.say(tid, "concern", f"Active official alert: {live[0]['title']}",
                   evidence=[{"source": "Pakistan Meteorological Department", "detail": (live[0].get("excerpt") or "")[:180]}])


def _route(out, bb, tracer, tid):
    hours = out.get("travel_hours") or [0, 0]
    if hours[1]:
        tracer.say(tid, "proposal", f"About {hours[0]:g}–{hours[1]:g} hours on the road in total ({out.get('road_km', 0):,} km).",
                   evidence=[{"source": "Raahi road data, OSRM check", "detail": "free-flow times; no live closures"}])
    for c in out.get("closures") or []:
        tracer.say(tid, "concern", f"Treated as closed: {c.get('name', c) if isinstance(c, dict) else c}.")
    for alt in (out.get("alternatives") or [])[:1]:
        tracer.say(tid, "proposal", f"{alt['label']}: {alt.get('why', '')}.", reason=alt.get("caveat"),
                   resolves=bb.hints.get("msg", {}).get("too_short"))


def _budget(out, bb, tracer, tid):
    comp = out.get("comparison") or {}
    total, pp = out.get("total"), out.get("per_person")
    if comp.get("status") == "over":
        mid = _remember(bb, "over_budget", tracer.say(
            tid, "concern", f"Estimate {rs(total)} ({rs(pp)} per person): {comp.get('message')}",
            evidence=[{"source": "Raahi cost model (estimate)", "detail": "transport, stays, food, entries, contingency"}]))
        fit = out.get("fit") or {}
        best = fit.get("best") or {}
        if best.get("change"):
            change = ", ".join(f"{k} → {v}" for k, v in best["change"].items())
            text = (f"The cheapest changes that fit: {change}, about {rs(best['total'])}." if fit.get("fits")
                    else f"Even the cheapest version I found ({change}) is about {rs(best['total'])}, "
                         f"{rs(fit.get('shortfall', 0))} over.")
            tracer.say(tid, "proposal", text, resolves=mid,
                       evidence=[{"source": "Budget search", "detail": f"{fit.get('options_tried', 0)} versions tried"}])
    else:
        tracer.say(tid, "proposal", f"Estimate {rs(total)} ({rs(pp)} per person)"
                   + (f": {comp['message']}" if comp.get("message") else "."),
                   evidence=[{"source": "Raahi cost model (estimate)", "detail": "not quotes"}])


def _accommodation(out, bb, tracer, tid):
    towns = out.get("towns") or []
    allowance = out.get("allowance_per_room_night")
    if not towns:
        return
    if allowance == 0 and bb.request and bb.request.budget_pkr:
        tracer.say(tid, "concern", "At Raahi's estimates the budget leaves nothing for rooms.",
                   resolves=None, evidence=[{"source": "Raahi cost model (estimate)", "detail": "after transport and food"}])
    else:
        tracer.say(tid, "proposal", f"Stays checked in {len(towns)} overnight town(s)"
                   + (f"; up to about {rs(allowance)} per room-night fits the budget." if allowance else "."),
                   evidence=[{"source": "Raahi guide, OpenStreetMap", "detail": "indicative prices, not quotes"}])


def _safety(out, bb, tracer, tid):
    days = [d for d in out.get("days", []) if d["category"] in ("High", "Severe")]
    for d in days[:2]:
        top = d["factors"][0] if d["factors"] else None
        tracer.say(tid, "concern", f"Day {d['day']} is {d['category']} ({d['score']}/100)"
                   + (f": {top['evidence']}" if top else "."), reason=d.get("action"),
                   evidence=[{"source": f["source"], "detail": f["evidence"]} for f in d["factors"][:2]])
    if not days and out.get("overall"):
        o = out["overall"]
        tracer.say(tid, "proposal", f"No high-risk day; the highest is {o['category']} ({o['score']}/100) on day {o['worst_day']}.",
                   reason="A heuristic from public data, not an official safety assessment.",
                   evidence=[{"source": "Raahi risk model", "detail": f"confidence {out.get('confidence')}"}])


def _packing(out, bb, tracer, tid):
    items = out.get("items") or []
    if items:
        essentials = [i["name"] for i in items if i.get("priority") == "essential"][:3]
        tracer.say(tid, "proposal", f"{len(items)} things to pack, based on {out.get('basis')}.",
                   evidence=[{"source": "Packing rules", "detail": ", ".join(essentials)}])


def _eco(out, bb, tracer, tid):
    cur = out.get("current") or {}
    kg = cur.get("kg_co2e")
    if kg:
        tracer.say(tid, "proposal", f"Transport about {kg[0]:,}–{kg[1]:,} kg CO2e; the lowest option is {str(out.get('lowest')).lower()}.",
                   evidence=[{"source": "UK DESNZ 2025 factors", "detail": "ranges with mountain-road assumptions"}])


def _validation(out, bb, tracer, tid):
    msgs = bb.hints.get("msg", {})
    for d in out.get("decisions") or []:
        tracer.say(tid, "decision", f"Your choice is needed: {d['message']}",
                   reason="Options: " + "; ".join(o["label"] for o in d.get("options", [])[:3]),
                   resolves=msgs.get("too_short" if d["code"] == "too_short" else "over_budget"))
    if not out.get("decisions"):
        passed = sum(1 for c in out.get("checks", []) if c["ok"])
        tracer.say(tid, "decision", f"{passed} of {len(out.get('checks', []))} checks passed: "
                   f"{out.get('verdict', '').replace('_', ' ')}. The plan can go to you.",
                   evidence=[{"source": "Validation", "detail": "no open roads, bookings or guarantees claimed"}])


_SPEAK = {"memory": _memory, "research": _research, "itinerary": _itinerary, "weather": _weather, "route": _route,
          "budget": _budget, "accommodation": _accommodation, "safety": _safety, "packing": _packing, "eco": _eco,
          "validation": _validation}
