"""Guided mode: a rule-based agent used when no AI model is configured or reachable.

It reads the message with the deterministic parser, calls the same validated tools as the
AI agent, and writes plain, honest answers from their results. It cannot chat freely, but
it can plan, re-plan, fit a plan to a lower budget, answer "is it safe / in season" questions,
suggest what to see, check the forecast and road information, estimate costs and open an
enquiry draft. It answers in English or Roman Urdu (see agent/lang.py).
"""
import re
from datetime import datetime

import data
from agent import parser
from agent.lang import assumed_words, p
from clock import PKT, today_pk
from agent.tools import ToolContext, execute
from money import rs, rs_range

EXAMPLES = ("Plan 6 days in Hunza from Islamabad in May for 2 people, budget Rs 1,50,000",
            "Weather in Skardu this week", "Is the road to Hunza open?")
EXAMPLES_UR = ("5 din Skardu jana hai, 4 log hain, budget 1 lakh hai",
               "Hunza mein family ke saath best places suggest karo", "Deosai jana safe rahega is month?")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
_ROUTE_FOR = {"khunjerab": "khunjerab-pass", "deosai": "deosai-road", "fairy-meadows": "fairy-meadows-track"}


def _time(iso: str | None) -> str:
    if not iso:
        return "just now"
    try:
        return datetime.fromisoformat(iso).astimezone(PKT).strftime("%H:%M") + " PKT"
    except ValueError:
        return iso


def respond(message: str, slots: dict, ctx: ToolContext, lang: str = "en") -> str:
    it = parser.intents(message)
    st = ctx.state
    dests = slots.get("destinations") or st.destinations

    # A budget change on a plan that is already shown: fit the plan's cost, not the stated budget.
    if (slots.get("budget_delta") or slots.get("budget_delta_pct")) and st.plan():
        return budget_change_text(slots, ctx, lang)

    if "weather" in it:
        if not dests:
            return ("Which place should I check the weather for? For example Hunza, Skardu or Fairy Meadows."
                    if lang != "ur" else "Kis jagah ka mausam check karoon? Maslan Hunza, Skardu ya Fairy Meadows.")
        return "\n\n".join(weather_text(execute("get_weather_forecast", {"destination": d}, ctx), lang) for d in dests[:2])
    # "Is it safe / in season?" about a place, before any plan exists for it.
    if "safety" in it and dests and not (st.has_itinerary and not slots.get("destinations")):
        return safety_text(dests[:2], slots, ctx, lang)
    if "road" in it and not ({"change"} & it):
        return roads_text(execute("get_road_status", {"destinations": dests}, ctx), lang)
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
        if lang == "ur":
            return ("Save ho gaya. Isi browser mein **My trips** se dobara khol sakte hain." if res.get("ok")
                    else f"Trip save nahi ho saka: {res.get('error')}")
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

    # "Hunza mein family ke saath best places suggest karo": what to see there, then plan it.
    if "suggest" in it and dests and not (slots.get("days") or slots.get("start_date") or st.has_itinerary):
        return highlights_text(dests[0], slots, ctx, lang, message)

    diff = st.changes_since_plan()
    if diff:
        res = execute("create_itinerary", {}, ctx)
        if res.get("ok"):
            what = ", ".join(_describe(k, a, b) for k, (a, b) in diff.items())
            return p(lang, "updated", what=what) + "\n\n" + plan_text(res["plan"], ctx, lang)
        return f"I couldn't make that change: {res.get('error')}"

    if dests and (st.days or st.start_date or "plan" in it or slots):
        if not st.days and not st.start_date:
            return ask(ctx, lead=p(lang, "great_choice", places=", ".join(data.place_name(d) for d in dests)), lang=lang)
        res = execute("create_itinerary", {}, ctx)
        if not res.get("ok"):
            return f"I couldn't build the plan: {res.get('error')}"
        text = plan_text(res["plan"], ctx, lang)
        if res.get("assumed_defaults"):
            text += "\n\n" + p(lang, "assumed", items=", ".join(assumed_words(lang, res["assumed_defaults"])))
        return text

    if "cost" in it and st.has_itinerary:
        res = execute("estimate_trip_budget", {}, ctx)
        return budget_text(res)

    if not dests and ({"suggest", "plan"} & it or slots.get("interests") or slots.get("month")):
        res = execute("search_destinations", {"interests": st.interests, "month": st.month}, ctx)
        names = [f"**{r['name']}** ({r['best_months']}): {r['tagline']}" for r in res.get("results", [])[:4]]
        if lang == "ur":
            return ("Aap ki baat ke mutabiq ye jagahen munasib hain:\n\n- " + "\n- ".join(names)
                    + "\n\nIn mein se kaun si, aur kitne din ke liye?")
        return ("Here are places that fit what you said:\n\n- " + "\n- ".join(names)
                + "\n\nWhich of these would you like, and for how many days?")

    if lang == "ur":
        lead = "Assalam-o-Alaikum! " if "greeting" in it else ""
        return (f"{lead}Main Raahi hoon. Northern Pakistan ka trip plan karna, mausam ka forecast, roads ke baare mein jo "
                "maloom hai wo, aur kharche ka andaza: sab is chat mein. Aise likhein:\n\n- " + "\n- ".join(EXAMPLES_UR))
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


def ask(ctx: ToolContext, lead: str = "", lang: str = "en") -> str:
    missing = ctx.state.missing()
    keys = {"destinations": "q_destinations", "dates": "q_dates", "days": "q_days", "travellers": "q_travellers",
            "budget": "q_budget"}
    picked = [p(lang, keys[m]) for m in missing if m in keys][:2]
    return (lead + " " if lead else "") + " ".join(picked)


def plan_text(plan: dict, ctx: ToolContext, lang: str = "en") -> str:
    lines = [f"**{plan['title']}**: {len(plan['days'])} {'din' if lang == 'ur' else 'days'}."]
    if not plan["feasibility"]["ok"]:
        lines.append(p(lang, "heads_up", n=plan["feasibility"]["planned_days"]))
    for d in plan["days"][:12]:
        when = f" ({d['date']})" if d.get("date") else ""
        night = f", night in {d['overnight']}" if d.get("overnight") else ""
        move = f": {d['moves'][0]}" if d.get("moves") else ""
        lines.append(f"- Day {d['day']}{when}: {d['title']}{move}{night}")
    b = plan["budget"]
    lines.append("\n" + p(lang, "estimate", total=rs(b["total"]), pp=rs(b["per_person"])))
    if b.get("comparison") and not any(w.startswith(b["comparison"]) for w in plan.get("warnings", [])):
        lines.append(b["comparison"])
    if plan.get("warnings"):
        firsts = [w.split(". ")[0].rstrip(".") + "." for w in plan["warnings"][:3]]
        lines.append("\n" + p(lang, "things") + "\n- " + "\n- ".join(firsts) + "\n\n" + p(lang, "panel"))
    missing = [m for m in ctx.state.missing() if m in ("dates", "budget", "travellers")]
    if missing:
        lines.append("\n" + ask(ctx, lang=lang))
    return "\n".join(lines)


# ── New: budget, safety and "what to see" answers ────────────────────────────────
_CHANGE_UR = {("accommodation", "budget"): "budget hotel", ("accommodation", "mid"): "mid-range hotel",
              ("transport", "bus"): "public coach", ("transport", "car"): "kiraye ki gaari"}
_CHANGE_EN = {("accommodation", "budget"): "budget stays", ("accommodation", "mid"): "mid-range stays",
              ("transport", "bus"): "public coaches", ("transport", "car"): "a hired car"}


def _change_words(change: dict, lang: str) -> str:
    table = _CHANGE_UR if lang == "ur" else _CHANGE_EN
    parts = [(f"{v} din" if lang == "ur" else f"{v} days") if k == "days" else table.get((k, v), f"{k} {v}")
             for k, v in change.items()]
    joiner = " aur " if lang == "ur" else " and "
    return joiner.join(parts)


def budget_change_text(slots: dict, ctx: ToolContext, lang: str) -> str:
    """Lower (or raise) the cost of the plan on screen with the Budget Intelligence optimiser."""
    delta, pct = slots.get("budget_delta"), slots.get("budget_delta_pct")
    if (delta or 0) > 0 or (pct or 0) > 0:
        base = ctx.state.budget_pkr or ctx.state.plan().budget_pkr
        if not base:
            return ("Abhi tak koi budget set nahi. Naya budget batayein, maslan 'budget 2 lakh'." if lang == "ur"
                    else "There is no budget set yet. Tell me the new budget, for example 'budget Rs 2,00,000'.")
        new = int(round((base + delta if delta else base * (100 + pct) / 100) / 100) * 100)
        res = execute("update_itinerary", {"changes": [{"op": "set", "field": "budget_pkr", "value": str(new)}]}, ctx)
        if not res.get("ok"):
            return f"I couldn't change the budget: {res.get('error')}"
        lead = (f"Budget {rs(base)} se {rs(new)} kar diya; plan wahi hai." if lang == "ur"
                else f"Budget changed from {rs(base)} to {rs(new)}; the plan is the same.")
        return lead + "\n\n" + plan_text(res["plan"], ctx, lang)
    args = {"keep_days": True}
    if delta:
        args["reduce_by_pkr"] = -delta
    else:
        args["reduce_by_percent"] = -pct
    res = execute("fit_plan_to_budget", args, ctx)
    if not res.get("ok"):
        return f"I couldn't work out a cheaper version: {res.get('error')}"
    if res.get("changed") is False and res.get("target", 0) >= res.get("from", 0):
        return res.get("note", "")
    out = []
    if res.get("changed"):
        what = _change_words(res["change"], lang)
        if lang == "ur":
            out.append(f"Ho gaya: andaazan kharcha **{rs(res['from'])} → {rs(res['to'])}** (target {rs(res['target'])}). "
                       f"Tabdeeli: {what}. Din aur jagahen wahi hain.")
        else:
            out.append(f"Done: the estimate goes from **{rs(res['from'])} to {rs(res['to'])}** (target {rs(res['target'])}) "
                       f"with {what}. Same days and places.")
    else:
        out.append(("Isi itinerary (wahi din) ke saath is se sasta version nahi mila." if lang == "ur"
                    else "With the same days, I couldn't find a cheaper version than this."))
    alts = [a for a in res.get("alternatives", []) if a.get("change")]
    if res.get("changed") and alts:
        a = alts[0]
        fit_word = (("target mein" if a["fits"] else "target se zyada") if lang == "ur"
                    else ("within the target" if a["fits"] else "above the target"))
        out.append((f"Doosra option: {_change_words(a['change'], 'ur')}, lag bhag {rs(a['total'])} ({fit_word}). Chahein to wo kar dein."
                     if lang == "ur" else f"The other option was {_change_words(a['change'], 'en')}: about {rs(a['total'])} "
                                          f"({fit_word}). Say so if you prefer it."))
    if not res.get("fits"):
        short = rs(res.get("shortfall") or 0)
        out.append((f"Target se ab bhi lag bhag {short} zyada hai." if lang == "ur"
                    else f"It is still about {short} above the target."))
        alt = res.get("if_days_change")
        if alt and alt.get("change"):
            if lang == "ur":
                out.append(f"Agar din kam karne theek hain: {_change_words(alt['change'], 'ur')} se lag bhag {rs(alt['to'])}. "
                           "Chahein to likhein 'ek din kam karo'.")
            else:
                out.append(f"If fewer days are fine: {_change_words(alt['change'], 'en')} would bring it to about "
                           f"{rs(alt['to'])}. Say 'one day less' if you want that.")
    plan = ctx.artifacts.get("itinerary")
    if plan:
        comp = plan["budget"].get("comparison")
        if isinstance(comp, dict) and comp.get("message"):
            out.append(comp["message"])
        elif isinstance(comp, str):
            out.append(comp)
    out.append("Ye Raahi ke cost model ke estimates hain, quotes nahi. Budget tab mein har line maujood hai." if lang == "ur"
               else "These are estimates from Raahi's cost model, not quotes. The Budget tab shows every line.")
    return "\n\n".join(out)


def _season(did: str, month: int) -> tuple[str, dict | None]:
    route = next((r for r in data.seasonal_routes() if r["id"] == _ROUTE_FOR.get(did)), None)
    if route and month not in route["typical_open_months"]:
        return "closed", route
    return ("best" if month in data.destination(did)["best_months"] else "possible"), route


def _span(months: list[int]) -> str:
    s = sorted(months)
    return f"{MONTHS[s[0] - 1]}–{MONTHS[s[-1] - 1]}" if s else ""


def safety_text(dests: list[str], slots: dict, ctx: ToolContext, lang: str) -> str:
    """Is it a good idea to go now / that month? From typical seasons, altitude, the live forecast
    where there is one, and the honest road picture. Never a safety guarantee."""
    st = ctx.state
    month = slots.get("month") or (st.start_date.month if st.start_date else st.month) or today_pk().month
    now = today_pk().month
    ur = lang == "ur"
    out = []
    any_closed = False
    for did in dests:
        d = data.destination(did)
        execute("get_destination_details", {"destination": did}, ctx)
        fit, route = _season(did, month)
        any_closed = any_closed or fit == "closed"
        m = MONTHS[month - 1]
        if ur:
            head = {"closed": "aam taur par munasib nahi", "best": "aam taur par achha waqt",
                    "possible": "mumkin, magar behtareen season nahi"}[fit]
            out.append(f"**{d['name']} {m} mein: {head}.**")
            if route and fit == "closed":
                out.append(f"- Season: {m} mein raasta aam taur par barf ki wajah se band hota hai; {route['name']} typically "
                           f"{_span(route['typical_open_months'])} khulti hai. (Typical pattern, live nahi.)")
            elif route:
                out.append(f"- Season: {route['name']} typically {_span(route['typical_open_months'])} khulti hai. "
                           f"Behtareen mahine: {_span(d['best_months'])}. (Typical pattern, live nahi.)")
            else:
                out.append(f"- Season: behtareen mahine {_span(d['best_months'])}. {d['season_note']} (Typical pattern, live nahi.)")
            out.append(f"- Bulandi: taqreeban {d['altitude_m']:,} m. {d['accessibility']}")
        else:
            head = {"closed": "usually not a good idea", "best": "usually a good time",
                    "possible": "possible, but not the best season"}[fit]
            out.append(f"**{d['name']} in {m}: {head}.**")
            if route and fit == "closed":
                out.append(f"- Season: access is usually closed by snow in {m}; {route['name']} is typically open "
                           f"{_span(route['typical_open_months'])}. Typical pattern, not live.")
            elif route:
                out.append(f"- Season: {route['name']} is typically open {_span(route['typical_open_months'])}; the best "
                           f"months are {_span(d['best_months'])}. Typical pattern, not live.")
            else:
                out.append(f"- Season: best {_span(d['best_months'])}. {d['season_note']} Typical pattern, not live.")
            out.append(f"- Altitude: about {d['altitude_m']:,} m. {d['accessibility']}")
        if month == now:
            fc = execute("get_weather_forecast", {"destination": did}, ctx).get("forecast", {})
            if fc.get("available"):
                risky = [f"{x['date']}: {x['risks'][0]}" for x in fc.get("days", [])[:5] if x.get("risks")]
                note = ("; ".join(risky[:2]) if risky else
                        ("agle 5 din mein koi shadeed mausam nahi" if ur else "no severe weather in the next 5 days"))
                out.append(f"- {'Mausam' if ur else 'Weather'}: {note} (Open-Meteo forecast, checked {_time(fc.get('retrieved_at'))}).")
            else:
                reason = (fc.get("reason") or "unavailable").rstrip(".")
                out.append(f"- {'Mausam' if ur else 'Weather'}: no live forecast ({reason[:1].lower() + reason[1:]}).")
    roads = execute("get_road_status", {"destinations": dests}, ctx)
    checks = roads.get("official_checks", [])
    where = "; ".join(f"{c['name']}" + (f" ({c['phone']})" if c.get("phone") else "") for c in checks[:2]) or "NHMP (130)"
    out.append(f"- Roads: **Current road status could not be verified.** "
               + (f"Safar wali subah check karein: {where}." if ur else f"Check on the morning you travel: {where}."))
    if any_closed:
        res = execute("search_destinations", {"month": month}, ctx)
        rest = [r for r in res.get("results", []) if r["id"] not in dests]
        best = [r for r in rest if any(w.startswith("good in") for w in r.get("why", []))][:3]
        maybe = [r for r in rest if any(w.startswith("outside its usual season") for w in r.get("why", []))][:3]
        m = MONTHS[month - 1]
        if best:
            names = ", ".join(f"**{r['name']}**" for r in best)
            out.append(f"{m} mein in jagahon ka season hai: {names}." if ur else f"In season instead in {m}: {names}.")
        if maybe:
            names = ", ".join(r["name"] for r in maybe)
            out.append(f"Mumkin, magar {m} un ka behtareen season nahi: {names}." if ur
                       else f"Possible, though {m} is outside their usual season: {names}.")
    out.append("Ye aam patterns aur dastiyab live forecast par mabni rehnumai hai, sarkari safety assessment nahi." if ur
               else "This is planning guidance from typical patterns and live forecasts where available, not an official "
                    "safety assessment.")
    return "\n".join(out)


def highlights_text(did: str, slots: dict, ctx: ToolContext, lang: str, message: str = "") -> str:
    """What to see in a place, from the guide, with family notes when it is a family trip."""
    res = execute("get_destination_details", {"destination": did}, ctx)
    if not res.get("ok"):
        return f"I couldn't look that up: {res.get('error')}"
    d = data.destination(did)
    family = "family" in (slots.get("interests") or []) or bool(slots.get("children")) or "family" in message.lower()
    ur = lang == "ur"
    lines = [f"**{d['name']} {'ki behtareen jagahen' if ur else 'at its best'}** ({'behtareen' if ur else 'best'} {_span(d['best_months'])}):"]
    lines += [f"- {h}" for h in d["highlights"]]
    if family:
        lines.append(f"\n{'Family ke saath' if ur else 'With family'}: {d['accessibility']}")
    ideas = " · ".join(x["title"] for x in d.get("day_plans", [])[:3])
    if ideas:
        lines.append(f"{'Din ke ideas' if ur else 'Ideas for the days'}: {ideas}.")
    alt = re.sub(r"^If [^:]{1,40}:\s*", "", d["bad_weather_alternative"])
    lines.append(f"{'Mausam kharab ho to' if ur else 'If the weather turns'}: {alt}")
    lines.append("\n" + ("Kitne din hain aur kab ja rahe hain? Phir din ba din plan ban jaye ga, safar ke dinon aur kharche samet."
                         if ur else "How many days do you have, and when are you going? Then I'll build the day-by-day plan, "
                                    "with the drive days and costs."))
    return "\n".join(lines)


# ── Existing answers (English facts; Roman Urdu framing where it helps) ─────────
def weather_text(res: dict, lang: str = "en") -> str:
    f = res.get("forecast", {})
    if not f.get("available"):
        extra = f" Seasonal note: {f['seasonal_note']}" if f.get("seasonal_note") else ""
        reason = (f.get("reason") or "the weather service is unavailable").rstrip(".")
        gloss = " (Abhi forecast nahi mil saka.)" if lang == "ur" else ""
        return f"I couldn't get a forecast: {reason}.{extra}{gloss}"
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
    out.append("Pahaari mausam jaldi badalta hai; forecast ka matlab ye nahi ke road ya trek safe hai." if lang == "ur"
               else "Mountain weather changes fast; a forecast does not mean a road or trek is safe.")
    return "\n".join(out)


def roads_text(res: dict, lang: str = "en") -> str:
    out = [f"**{res.get('headline', 'Current road status could not be verified.')}**", res.get("explanation", "")]
    if lang == "ur":
        out.insert(1, "(Road ki live halat kisi sarkari live source se confirm nahi ho saki.)")
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
    p_ = ctx.artifacts["places"][-1]
    if not p_.get("available"):
        return p_["message"]
    live = p_.get("live") or {}
    lines = []
    if p_["kind"] == "stay":
        rng = range_text(p_.get("range"))
        lines.append(f"**Places to stay in {p_['name']}**" + (f" for {rng} a night" if rng else "") + ".")
        if p_.get("curated"):
            shown = [o for o in p_["curated"]["options"] if o.get("in_range") is not False]
            others = len(p_["curated"]["options"]) - len(shown)
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
        lines.append(f"**Food in {p_['name']}**")
        dishes = p_.get("dishes")
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
