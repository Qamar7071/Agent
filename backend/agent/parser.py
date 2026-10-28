"""Deterministic reading of a traveller's message (English, Urdu in Latin script, mixed).

It pulls out trip details (places, dates, days, people, budget, transport, pace…) and the
kind of question being asked. The agent uses it to keep the structured trip state up to
date even when no language model is available, and the guided mode uses it to answer.
It never guesses: anything ambiguous is left for the agent to ask about.
"""
import re
from datetime import date, timedelta

import data
from clock import today_pk
from schemas import TripState, normalise_interests

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
     "november", "december"], start=1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9
MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
                "ten": 10, "eleven": 11, "twelve": 12, "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4,
                "panch": 5, "paanch": 5, "chay": 6, "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10}
NUM = r"(\d{1,2}|" + "|".join(NUMBER_WORDS) + r")"

INTENT_WORDS = {
    "greeting": r"^(hi|hello|hey|salam|salaam|assalam|aoa|asalam|hola)\b",
    "weather": r"\b(weather|forecast|temperature|temp|rain|raining|snow|snowfall|cold|hot|mausam|barish|baarish|"
               r"baraf|thand|sardi|garmi)\b",
    "road": r"\b(road|roads|kkh|karakoram highway|highway|landslide|landslides|blocked|closure|closed|open|"
            r"sarak|sadak|rasta|raasta|band)\b",
    "route": r"\b(how far|distance|km|kilomet|drive time|how long.*(drive|take)|kitna door|kitni door|route)\b",
    "cost": r"\b(cost|costs|budget|price|prices|expensive|cheap|kharcha|kharch|kitna|kitne|paisay|paise|rupees)\b",
    "plan": r"\b(plan|itinerary|trip|tour|visit|travel|jana|jaana|ghoomna|ghumna|safar|days|din|weekend|week|trek|"
            r"holiday|vacation|honeymoon|chutti|chuttiyan|see|go to|explore)\b",
    "change": r"\b(change|instead|add|remove|replace|swap|make it|more relaxed|shorter|longer|cheaper|badal|"
              r"hata|shamil|extend)\b",
    "booking": r"\b(book|booking|reserve|reservation|enquiry|inquiry|contact an operator)\b",
    "save": r"\b(save|bookmark|mehfooz)\b",
    "stays": r"\b(hotel|hotels|stay|stays|guesthouse|accommodation|room|rooms|kamra)\b",
    "suggest": r"\b(suggest|recommend|where should|best place|kahan|kidhar|ideas?)\b",
}


def _num(word: str | None) -> int | None:
    if not word:
        return None
    word = word.lower()
    if word.isdigit():
        return int(word)
    return NUMBER_WORDS.get(word)


def intents(text: str) -> set[str]:
    t = (text or "").lower().strip()
    return {name for name, pattern in INTENT_WORDS.items() if re.search(pattern, t)}


def _amount(num: str, unit: str | None) -> int | None:
    try:
        value = float(num.replace(",", ""))
    except ValueError:
        return None
    unit = (unit or "").lower()
    if unit in ("k", "thousand", "hazar", "hazaar"):
        value *= 1_000
    elif unit in ("lakh", "lac", "lakhs", "lacs"):
        value *= 100_000
    elif unit in ("m", "million"):
        value *= 1_000_000
    return int(value) if 1_000 <= value <= 20_000_000 else None


CURRENCY = re.compile(r"pkr|rs\.?|rupees|rupay|rupaye")


def _budget(t: str) -> int | None:
    """An amount of money: '100,000 PKR', 'Rs 80k', '1.5 lakh', 'budget 120000', '80 hazar'."""
    for m in re.finditer(r"(?<![\d\-/])(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|hazar|hazaar|lakhs?|lacs?|million)?\b(?![\-/]\d)", t):
        unit = m.group(2)
        before, after = t[max(0, m.start() - 10):m.start()], t[m.end():m.end() + 8]
        near_currency = CURRENCY.search(before) or CURRENCY.search(after)
        near_budget = re.search(r"budget|kharch|cost|afford", t[max(0, m.start() - 24):m.start()])
        amount = _amount(m.group(1), unit)
        if not amount:
            continue
        if unit or near_currency or (near_budget and amount >= 5000):
            return amount
    return None


def _date(text: str, today: date) -> tuple[date | None, int | None]:
    """(start date, month) from text such as '10 Nov', 'November 10', '2026-11-10', 'in June', 'tomorrow'."""
    t = text.lower()
    m = re.search(r"\b(20\d\d)-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3])), None
        except ValueError:
            return None, None
    m = re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({MONTH_RE})\b(?:,?\s*(20\d\d))?", t) or \
        re.search(rf"\b({MONTH_RE})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:,?\s*(20\d\d))?", t)
    if m:
        a, b, year = m.group(1), m.group(2), m.group(3)
        day_s, mon_s = (a, b) if a.isdigit() else (b, a)
        mon = MONTHS[mon_s]
        yr = int(year) if year else (today.year if (mon, int(day_s)) >= (today.month, today.day) else today.year + 1)
        try:
            return date(yr, mon, int(day_s)), None
        except ValueError:
            return None, None
    if re.search(r"\b(tomorrow|kal)\b", t) and not re.search(r"\b(kal raat|yesterday)\b", t):
        return today + timedelta(days=1), None
    if re.search(r"\b(next month|agle mahine|agla mahina)\b", t):
        return None, today.month % 12 + 1
    m = re.search(rf"\b(?:in|during|of|for|this|next)\s+({MONTH_RE})\b|\b({MONTH_RE})\s+(?:mein|me|main|mai)\b", t)
    if m:
        return None, MONTHS[m.group(1) or m.group(2)]
    return None, None


def extract(text: str, today: date | None = None) -> dict:
    """Trip details stated in one message. Only what is actually said is returned."""
    today = today or today_pk()
    t = " " + (text or "").lower() + " "
    out: dict = {}

    dests = data.match_destinations(t)
    removed = []
    for did in dests:
        names = "|".join(re.escape(a) for a in [*data.destination(did)["aliases"], data.destination(did)["name"].lower()])
        if re.search(rf"\b(remove|without|skip|drop|exclude|cancel|hata(?:o|do|dein)?|nikal(?:o|do)?)\s+(?:the\s+)?(?:{names})\b"
                     rf"|\b(?:{names})\s+(?:ko\s+)?(hata|nikal|remove|skip|nahi|nhi)\b", t):
            removed.append(did)
    if removed:
        out["remove_destinations"] = removed
    dests = [d for d in dests if d not in removed]
    if dests:
        out["destinations"] = dests

    for name in data.origins():
        n = name.lower()
        if re.search(rf"\bfrom\s+{n}\b|\b{n}\s+(?:se|say|sy)\b|\bstarting (?:in|from)\s+{n}\b", t):
            out["origin"] = name
            break

    more = re.search(r"\b(one|1|a|ek)\s+(more\s+)?(day|din)\s+(more|extra|longer|aur|zyada)\b"
                     r"|\b(add|one more|ek aur)\s+(a\s+)?(day|din)\b", t)
    less = re.search(r"\b(one|1|a|ek)\s+(day|din)\s+(less|shorter|kam)\b|\b(remove|cut|drop)\s+(a|one)\s+day\b", t)
    m = re.search(rf"\b{NUM}\s*(?:-|\s)?(days?|din|dinon|nights?|raat|raatein)\b", t)
    if more or less:
        out["days_delta"] = 1 if more else -1
    elif m and _num(m.group(1)):
        n = _num(m.group(1))
        out["days"] = n + 1 if m.group(2).startswith(("night", "raat")) else n
    elif re.search(r"\b(a|one|ek)\s+week\b|\bek hafta\b|\bweek long\b", t):
        out["days"] = 7
    elif re.search(r"\b(two|2)\s+weeks\b|\bdo hafte\b", t):
        out["days"] = 14
    elif re.search(r"\bweekend\b", t):
        out["days"] = 3

    m = re.search(rf"\b{NUM}\s+(?:adults?|people|persons?|travell?ers|friends|log|afraad|members|pax)\b", t) or \
        re.search(rf"\bfor\s+{NUM}\b(?!\s*(?:days?|nights?|din|weeks?|k\b|lakh|thousand))", t) or \
        re.search(rf"\bwe are\s+{NUM}\b|\bhum\s+{NUM}\b|\b{NUM}\s+of\s+us\b|\bgroup of\s+{NUM}\b", t)
    if m:
        n = _num(next(x for x in m.groups() if x))
        if n and 1 <= n <= 20:
            out["adults"] = n
    elif re.search(r"\b(couple|my wife and i|my husband and i|with my wife|with my husband|honeymoon)\b", t):
        out["adults"] = 2
    elif re.search(r"\b(solo|alone|akela|akeli|by myself|just me)\b", t):
        out["adults"] = 1
    m = re.search(rf"\b{NUM}\s+(?:kids?|children|child|bachy|bachay|bache|bachon)\b", t)
    if m and _num(m.group(1)) is not None:
        out["children"] = _num(m.group(1))
    elif re.search(r"\b(no kids|no children|without kids)\b", t):
        out["children"] = 0

    budget = _budget(t)
    if budget:
        out["budget_pkr"] = budget
        if re.search(r"per (person|head|traveller|adult)|\beach\b|fi kas|per banda|har banda", t):
            out["budget_basis"] = "per_person"
        elif re.search(r"\b(total|in all|overall|kul)\b", t):
            out["budget_basis"] = "total"

    start, month = _date(t, today)
    if start:
        out["start_date"] = start
        out["month"] = start.month
    elif month:
        out["month"] = month

    if re.search(r"\b(fly|flight|flights|plane|jahaz|air)\b", t):
        out["transport"] = "flight"
    elif re.search(r"\b(bus|coach|coaster|daewoo|natco|public transport)\b", t):
        out["transport"] = "bus"
    elif re.search(r"\b(by car|by road|drive|driving|own car|gari|gaari|jeep)\b", t):
        out["transport"] = "car"

    if re.search(r"\b(budget (?:hotel|stay|room)s?|cheap|cheapest|sasta|guesthouse|low cost|backpack)", t):
        out["accommodation"] = "budget"
    elif re.search(r"\b(luxury|premium|5[- ]?star|five star|serena|best hotels?)\b", t):
        out["accommodation"] = "premium"
    elif re.search(r"\b(mid[- ]?range|standard|3[- ]?star)\b", t):
        out["accommodation"] = "mid"

    if re.search(r"\b(relaxed|relax|slow|easy pace|aram|aaram|sukoon|peaceful)\b", t):
        out["pace"] = "relaxed"
    elif re.search(r"\b(packed|fast|active|adventurous|adventure|see everything|zyada se zyada)\b", t):
        out["pace"] = "active"

    interests = re.findall(r"\b(mountains?|lakes?|photography|photos?|trekking|hiking|hikes?|culture|history|forts?|"
                           r"food|local food|nature|wildlife|stargazing|stars|peaceful|adventure|family)\b", t)
    if interests:
        out["interests"] = normalise_interests(interests)

    needs = []
    if re.search(r"\bwheelchair\b", t):
        needs.append("wheelchair")
    if re.search(r"\b(can't walk|cannot walk|limited mobility|knee|walking difficulty|chal nahi)\b", t):
        needs.append("limited_mobility")
    if re.search(r"\b(elderly|old parents|senior|buzurg|ammi abbu|parents)\b", t):
        needs.append("elderly")
    if re.search(r"\b(altitude sickness|breathing|asthma|heart)\b", t):
        needs.append("altitude_sensitive")
    if re.search(r"\b(infant|baby|toddler)\b", t):
        needs.append("infant")
    if needs:
        out["accessibility"] = needs

    if re.search(r"\b(vegetarian|vegan|halal|no meat|gluten)\b", t):
        out["food"] = re.search(r"\b(vegetarian|vegan|halal|no meat|gluten[- ]free|gluten)\b", t).group(1)
    if re.search(r"\b(with a guide|want a guide|need a guide|guide chahiye|local guide)\b", t):
        out["guide"] = True
    elif re.search(r"\b(no guide|without a guide)\b", t):
        out["guide"] = False
    return out


def merge(state: TripState, slots: dict) -> TripState:
    """New facts override old ones; lists of places are added to unless the user replaces them."""
    if not slots:
        return state
    upd = {}
    for key, value in slots.items():
        if key == "remove_destinations":
            continue
        if key == "days_delta":
            base = state.days or (state.plan().days if state.plan() else None)
            if base:
                upd["days"] = max(1, min(30, base + value))
            continue
        if key == "destinations":
            upd[key] = list(dict.fromkeys([*state.destinations, *value])) if state.destinations else value
        elif key in ("interests", "accessibility"):
            upd[key] = list(dict.fromkeys([*getattr(state, key), *value]))[:10]
        else:
            upd[key] = value
    if slots.get("remove_destinations"):
        keep = upd.get("destinations", state.destinations)
        upd["destinations"] = [d for d in keep if d not in slots["remove_destinations"]]
    if "start_date" in upd:
        upd["month"] = upd["start_date"].month
    # Forget "assumed" notes about anything the traveller has now stated.
    words = {"origin": "starting from", "days": "days", "adults": "adult", "transport": "travelling",
             "accommodation": "stays", "pace": "pace", "start_date": "dates", "month": "dates"}
    stated = [w for k, w in words.items() if k in upd]
    if state.assumed and stated:
        upd["assumed"] = [a for a in state.assumed if not any(w in a for w in stated)]
    if "month" in upd and "start_date" not in upd and state.start_date and state.start_date.month != upd["month"]:
        upd["start_date"] = None
    return TripState.model_validate({**state.model_dump(), **upd})
