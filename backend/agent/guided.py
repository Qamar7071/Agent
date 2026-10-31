"""Guided mode: a rule-based agent used when no AI model is configured or reachable.

It reads the message with the deterministic parser, calls the same validated tools as the
AI agent, and writes plain, honest answers from their results. It cannot chat freely, but
it can plan, re-plan, check the forecast and road information, estimate costs and open an
enquiry draft.
"""
from datetime import datetime

import data
from agent import parser
from clock import PKT
from agent.tools import ToolContext, execute
from money import rs, rs_range

EXAMPLES = ("Plan 6 days in Hunza from Islamabad in May for 2 people, budget Rs 1,50,000",
            "Weather in Skardu this week", "Is the road to Hunza open?")


def _time(iso: str | None) -> str:
    if not iso:
        return "just now"
    try:
        return datetime.fromisoformat(iso).astimezone(PKT).strftime("%H:%M") + " PKT"
    except ValueError:
        return iso


def respond(message: str, slots: dict, ctx: ToolContext) -> str:
    it = parser.intents(message)
    st = ctx.state
    dests = slots.get("destinations") or st.destinations

    if "weather" in it:
        if not dests:
            return "Which place should I check the weather for? For example Hunza, Skardu or Fairy Meadows."
        return "\n\n".join(weather_text(execute("get_weather_forecast", {"destination": d}, ctx)) for d in dests[:2])
    if "road" in it and not ({"change"} & it):
        return roads_text(execute("get_road_status", {"destinations": dests}, ctx))
    if "route" in it and (dests or slots.get("origin")):
        origin = slots.get("origin") or st.origin or "Islamabad"
        return route_text(execute("get_route_information", {"origin": origin, "destination": (dests or ["hunza"])[0]}, ctx))
    if "booking" in it:
        res = execute("create_booking_enquiry", {}, ctx)
        if not res.get("storage_available"):
            return ("I've prepared an enquiry draft, but this website cannot store enquiries yet, so it can't be sent "
                    "from here. Nothing has been booked.")
        return ("I've opened an enquiry form with your trip filled in. Add your contact details, tick the consent box "
                "and press Send. It is only an enquiry: nothing is booked or paid, and the Raahi team will review it.")
    if "save" in it and st.has_itinerary:
        res = execute("save_trip", {}, ctx)
        return ("Saved. You can reopen it from **My trips** in this browser." if res.get("ok")
                else f"I couldn't save the trip: {res.get('error')}")

    if {"stays", "food"} & it and not (slots.get("days") or slots.get("start_date")):
        town = (slots.get("place_towns") or slots.get("destinations") or st.destinations or [None])[0]
        if not town:
            return "Which town? For example Hunza (Karimabad), Attabad, Passu, Skardu, Gilgit or Chilas."
        if "food" in it and "stays" not in it:
            return places_text(execute("find_places", {"town": town, "kind": "food"}, ctx), ctx)
        lo, hi = slots.get("night_range") or (None, None)
        return places_text(execute("find_places", {"town": town, "kind": "stay", "min_pkr_per_night": lo,
                                                   "max_pkr_per_night": hi}, ctx), ctx)

    diff = st.changes_since_plan()
    if diff:
        res = execute("create_itinerary", {}, ctx)
        if res.get("ok"):
            what = ", ".join(_describe(k, a, b) for k, (a, b) in diff.items())
            return f"Updated the plan ({what}) and kept your other choices.\n\n" + plan_text(res["plan"], ctx)
        return f"I couldn't make that change: {res.get('error')}"

    if dests and (st.days or st.start_date or "plan" in it or slots):
        if not st.days and not st.start_date:
            return ask(ctx, lead=f"Great choice: {', '.join(data.place_name(d) for d in dests)}.")
        res = execute("create_itinerary", {}, ctx)
        if not res.get("ok"):
            return f"I couldn't build the plan: {res.get('error')}"
        text = plan_text(res["plan"], ctx)
        if res.get("assumed_defaults"):
            text += "\n\nI assumed " + ", ".join(res["assumed_defaults"]) + ". Tell me if any of that is different."
        return text

    if "cost" in it and st.has_itinerary:
        res = execute("estimate_trip_budget", {}, ctx)
        return budget_text(res)

    if not dests and ({"suggest", "plan"} & it or slots.get("interests") or slots.get("month")):
        res = execute("search_destinations", {"interests": st.interests, "month": st.month}, ctx)
        names = [f"**{r['name']}** ({r['best_months']}): {r['tagline']}" for r in res.get("results", [])[:4]]
        return ("Here are places that fit what you said:\n\n- " + "\n- ".join(names)
                + "\n\nWhich of these would you like, and for how many days?")

    lead = "Assalam-o-Alaikum! " if "greeting" in it else ""
    return (f"{lead}I'm Raahi. I can plan a trip to Northern Pakistan, check the forecast, explain what is known about "
            "the roads, and estimate costs. Try:\n\n- " + "\n- ".join(EXAMPLES))


def _describe(key: str, old, new) -> str:
    label = key.replace("_", " ")
    if key == "destinations":
        added = [data.place_name(d) for d in new if d not in old]
        gone = [data.place_name(d) for d in old if d not in new]
        return "; ".join(x for x in [("added " + ", ".join(added)) if added else "",
                                     ("removed " + ", ".join(gone)) if gone else ""] if x) or "destinations"
    return f"{label}: {old} → {new}"


def ask(ctx: ToolContext, lead: str = "") -> str:
    missing = ctx.state.missing()
    questions = {
        "destinations": "Where would you like to go (for example Hunza, Skardu or Fairy Meadows)?",
        "dates": "When are you travelling? Exact dates are best; a month is fine for now.",
        "days": "How many days do you have in total, including travel?",
        "travellers": "How many people are travelling (and any children)?",
        "budget": "What is your budget in rupees, and is it in total or per person?",
    }
    picked = [questions[m] for m in missing if m in questions][:2]
    return (lead + " " if lead else "") + " ".join(picked)


def plan_text(plan: dict, ctx: ToolContext) -> str:
    lines = [f"**{plan['title']}**: {len(plan['days'])} days."]
    if not plan["feasibility"]["ok"]:
        lines.append(f"Heads up: this route needs at least {plan['feasibility']['planned_days']} days.")
    for d in plan["days"][:12]:
        when = f" ({d['date']})" if d.get("date") else ""
        night = f", night in {d['overnight']}" if d.get("overnight") else ""
        move = f": {d['moves'][0]}" if d.get("moves") else ""
        lines.append(f"- Day {d['day']}{when}: {d['title']}{move}{night}")
    b = plan["budget"]
    lines.append(f"\nEstimated cost: about **{rs(b['total'])}** ({rs(b['per_person'])} per person). "
                 "This is an estimate from Raahi's assumptions, not a quote.")
    if b.get("comparison") and not any(w.startswith(b["comparison"]) for w in plan.get("warnings", [])):
        lines.append(b["comparison"])
    if plan.get("warnings"):
        firsts = [w.split(". ")[0].rstrip(".") + "." for w in plan["warnings"][:3]]
        lines.append("\nThings to know:\n- " + "\n- ".join(firsts) + "\n\nThe plan panel has the details, costs and sources.")
    missing = [m for m in ctx.state.missing() if m in ("dates", "budget", "travellers")]
    if missing:
        lines.append("\n" + ask(ctx))
    return "\n".join(lines)


def weather_text(res: dict) -> str:
    f = res.get("forecast", {})
    if not f.get("available"):
        extra = f" Seasonal note: {f['seasonal_note']}" if f.get("seasonal_note") else ""
        reason = (f.get("reason") or "the weather service is unavailable").rstrip(".")
        return f"I couldn't get a forecast: {reason}.{extra}"
    out = [f"**{f['destination']}**: Open-Meteo model forecast, checked {_time(f.get('retrieved_at'))}."]
    for d in f["days"][:5]:
        rain = f", rain {d['rain_mm']} mm" if d.get("rain_mm") else ""
        snow = f", snow {d['snow_cm']} cm" if d.get("snow_cm") else ""
        out.append(f"- {d['date']}: {d['summary']}, {d['min_c']}° to {d['max_c']}°C{rain}{snow}")
        for r in d.get("risks", [])[:1]:
            out.append(f"  - ⚠ {r}")
    a = res.get("official_alerts", {})
    if a.get("available"):
        out.append(f"Official PMD alerts active now: {a.get('active_count', 0)}.")
    out.append("Mountain weather changes fast; a forecast does not mean a road or trek is safe.")
    return "\n".join(out)


def roads_text(res: dict) -> str:
    out = [f"**{res.get('headline', 'Current road status could not be verified.')}**", res.get("explanation", "")]
    a = res.get("official_weather_alerts", {})
    if a.get("available"):
        active = [x for x in a.get("alerts", []) if x.get("active")]
        out.append(f"Official PMD weather alerts for the region: {len(active)} active." if active
                   else "No active PMD weather alert mentions the region right now (that does not mean roads are open).")
    for s in res.get("seasonal_outlook", [])[:3]:
        flag = "" if s.get("usually_open_that_month") in (None, True) else " (usually closed that month)"
        out.append(f"- {s['route']}: typically open {s.get('typical_open_text', '')}{flag}. "
                   "Typical pattern, not live.")
    checks = res.get("official_checks", [])
    if checks:
        out.append("Check before you leave: " + "; ".join(
            f"{c['name']}" + (f" (call {c['phone']})" if c.get("phone") else "") for c in checks[:2]) + ".")
    out.append(res.get("rule", ""))
    return "\n".join(x for x in out if x)


def route_text(res: dict) -> str:
    if not res.get("ok", True) or res.get("error"):
        return f"I couldn't work out that route: {res.get('error')}"
    c = res.get("curated_estimate") or {}
    out = [f"**{res['from']} → {res['to']}**: about {c.get('km', '?')} km, {c.get('time', '?')} of driving "
           f"(Raahi's approximate estimate)."]
    if c.get("driving_days", 1) > 1:
        out.append(f"Plan it as {c['driving_days']} driving days with an overnight stop.")
    eng = res.get("routing_engine") or {}
    if eng.get("available"):
        out.append(f"OpenStreetMap routing: {eng['km']} km, {eng['free_flow_hours']} h without stops (a lower bound).")
    if res.get("maps_url"):
        out.append(f"[Open in Google Maps]({res['maps_url']})")
    out.append(res.get("advice", ""))
    return "\n".join(out)


def budget_text(res: dict) -> str:
    if not res.get("ok"):
        return f"I couldn't estimate the budget: {res.get('error')}"
    out = [f"Estimated total: **{rs(res['total'])}** ({rs(res['per_person'])} per person). Estimate, not a quote."]
    for l in res["lines"][:7]:
        out.append(f"- {l['item']}: {rs(l['amount'])} ({l['how']})")
    if res.get("comparison", {}).get("message"):
        out.append(res["comparison"]["message"])
    for s in res.get("savings", [])[:2]:
        out.append(f"- To save: {s['label'].lower()} (about {rs(s['saves_pkr'])})")
    return "\n".join(out)


def summary_of(ctx: ToolContext) -> str | None:
    """When the AI stops early, describe what the tools produced instead of saying nothing."""
    if ctx.artifacts.get("itinerary"):
        from planner import compact
        return "Here's the plan I put together:\n\n" + plan_text(compact(ctx.artifacts["itinerary"]), ctx)
    if ctx.artifacts.get("roads"):
        return roads_text(ctx.artifacts["roads"])
    if ctx.artifacts.get("weather"):
        did, fc = next(iter(ctx.artifacts["weather"].items()))
        from agent.tools import _forecast_view
        return weather_text({"forecast": _forecast_view(fc), "official_alerts": {}})
    return None


def range_text(rng: dict | None) -> str:
    if not rng:
        return ""
    lo, hi = rng.get("min"), rng.get("max")
    if lo and hi:
        return f"{rs_range(lo, hi)}"
    return f"up to {rs(hi)}" if hi else f"{rs(lo)} or more"


def places_text(res: dict, ctx: ToolContext) -> str:
    if not res.get("ok"):
        return f"I couldn't look that up: {res.get('error')}"
    p = ctx.artifacts["places"][-1]
    if not p.get("available"):
        return p["message"]
    live = p.get("live") or {}
    lines = []
    if p["kind"] == "stay":
        rng = range_text(p.get("range"))
        lines.append(f"**Places to stay in {p['name']}**" + (f" for {rng} a night" if rng else "") + ".")
        if p.get("curated"):
            shown = [o for o in p["curated"]["options"] if o.get("in_range") is not False]
            others = len(p["curated"]["options"]) - len(shown)
            lines.append("\nFrom Raahi's guide (indicative price per room-night, not quotes):")
            if not shown:
                lines.append("- None of the places in Raahi's guide usually fit this range.")
            for o in shown:
                price = f"{rs_range(o['from'], o['to'])}" if o.get("to") else "arranged by your operator"
                fit = {True: ", fits your range", False: ", outside your range"}.get(o.get("in_range"), "")
                lines.append(f"- **{o['name']}** ({o['tier']}): {price}{fit}")
            if others:
                lines.append(f"- {others} more in the guide are outside your range (see the Stays tab).")
        if live.get("available"):
            places = [x for x in live["places"] if x.get("fit") != "unlikely"][:8]
            if places:
                lines.append(f"\nOn OpenStreetMap (real places, no prices; checked {_time(live.get('retrieved_at'))}):")
                for x in places:
                    stars = f", {x['stars']}★" if x.get("stars") else ""
                    fit = {"usually": ": this type usually fits your range", "unknown": ": price level unknown"}.get(
                        x.get("fit"), "")
                    phone = f", {x['phone']}" if x.get("phone") else ""
                    lines.append(f"- {x['name']} ({x['type']}{stars}){fit}{phone}")
            else:
                lines.append("\nOpenStreetMap has no matching places to stay recorded here.")
        elif live:
            lines.append(f"\nLive listings: {live.get('reason')}")
        lines.append("\nConfirm the price and availability with the place before you pay.")
    else:
        lines.append(f"**Food in {p['name']}**")
        dishes = p.get("dishes")
        if dishes:
            lines.append(f"\nLocal food ({dishes['area']}): "
                         + "; ".join(f"{d['name']} ({d['about'].rstrip('.').lower()})" for d in dishes["dishes"]) + ".")
        if live.get("available"):
            if live["places"]:
                lines.append(f"\nRestaurants and cafés on OpenStreetMap (checked {_time(live.get('retrieved_at'))}):")
                for x in live["places"][:8]:
                    cuisine = f", {', '.join(x['cuisine'])}" if x.get("cuisine") else ""
                    lines.append(f"- {x['name']} ({x['type']}{cuisine})")
            else:
                lines.append("\nOpenStreetMap has no restaurants recorded here.")
        elif live:
            lines.append(f"\nLive listings: {live.get('reason')}")
        lines.append("\nMany places in the north close in winter, so check before you go.")
    return "\n".join(lines)
