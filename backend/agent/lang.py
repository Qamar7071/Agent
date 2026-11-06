"""The reply language for guided mode: English or Roman Urdu (Urdu written in Latin letters).

Detection is deliberately simple and explainable: distinctive Roman Urdu words (hai, mein,
jana, karo, chahiye…) against English function words. A short message with neither keeps the
language of the conversation so far. Words that are also English ("do", "main", "me", "is")
are not counted.

Roman Urdu replies switch code the way people text: the framing is in Roman Urdu, while
honesty-critical facts (road status, forecast sources, estimates) keep their exact English
sentence so their meaning never drifts in translation.
"""
import re

UR_WORDS = {
    "hai", "hain", "hoon", "hun", "tha", "thi", "the", "ka", "ki", "ke", "ko", "se", "mein", "mai", "pe", "aur",
    "ya", "kya", "kyun", "kaise", "kaisa", "kaisi", "kitna", "kitni", "kitne", "kab", "kahan", "kidhar", "jana",
    "jaana", "jaye", "jayen", "jaen", "chahiye", "chahte", "chahta", "chahti", "karo", "kardo", "krdo", "kro",
    "karen", "karein", "kijiye", "dein", "batao", "bataen", "bata", "btao", "log", "logon", "din", "raat", "hum",
    "humein", "hamein", "mujhe", "mera", "meri", "mere", "hamara", "hamari", "acha", "achha", "theek", "thik",
    "sahi", "rahega", "rahegi", "rahenge", "hoga", "hogi", "honge", "nahi", "nahin", "nhi", "zyada", "ziada",
    "kam", "wala", "wali", "wale", "ghoomna", "ghumna", "safar", "saath", "sath", "bachay", "bachon", "bache",
    "abhi", "agar", "lekin", "magar", "bhi", "sirf", "kuch", "koi", "haan", "jee", "ji", "shukriya", "mausam",
    "barish", "kharcha", "kharch", "paisay", "paise", "sasta", "mehenga", "jagah", "jagahen", "bilkul", "zara",
    "liye", "lie", "wahan", "yahan", "kal", "parson", "hafta", "mahina", "mahine", "khula", "band", "raasta",
    "rasta", "sadak", "sarak", "gari", "gaari", "batayen", "chalein", "chalo", "ghar", "walon", "sakte", "sakta",
    "ek", "kar", "kr", "aaj", "khuli", "hazar", "hazaar", "lakh", "mahinay", "rakho", "rakhein", "wahi", "dikhao",
}
EN_WORDS = {"the", "is", "are", "my", "we", "for", "to", "and", "in", "of", "with", "what", "how", "can", "please",
            "would", "could", "should", "this", "that", "there", "our", "i", "you", "it", "be", "will", "want",
            "make", "reduce", "cut", "increase", "cheaper", "more", "less", "by", "a", "an", "at", "on", "from", "next",
            "show", "give", "tell", "add", "remove", "change", "keep", "same", "need", "trip", "days", "people",
            "weather", "road", "roads", "hotel", "hotels", "plan", "suggest", "best", "places", "when", "where", "which",
            "much", "many", "cost", "price", "open", "closed", "safe", "go", "going", "visit", "also", "but", "or"}
# "the" is also Roman Urdu ("they were"); it only counts as English next to other English words.
UR_STRONG = UR_WORDS - {"the", "band", "kal", "log", "din"}


def detect(text: str, previous: str | None = None) -> str:
    words = re.findall(r"[a-z']+", (text or "").lower())
    ur = {w for w in words if w in UR_STRONG}
    en = {w for w in words if w in EN_WORDS}
    if re.search(r"[؀-ۿ]", text or ""):          # Urdu script: answer in Roman Urdu
        return "ur"
    if len(ur) >= 2 or (len(ur) == 1 and not en and len(words) <= 4):
        return "ur"
    if len(en) >= 2 and not ur:
        return "en"
    return previous if previous in ("en", "ur") else "en"


# Phrases for the guided replies. Keys are shared; {placeholders} are filled by guided.py.
PHRASES = {
    "en": {
        "great_choice": "Great choice: {places}.",
        "q_destinations": "Where would you like to go (for example Hunza, Skardu or Fairy Meadows)?",
        "q_dates": "When are you travelling? Exact dates are best; a month is fine for now.",
        "q_days": "How many days do you have in total, including travel?",
        "q_travellers": "How many people are travelling (and any children)?",
        "q_budget": "What is your budget in rupees, and is it in total or per person?",
        "assumed": "I assumed {items}. Tell me if any of that is different.",
        "updated": "Updated the plan ({what}) and kept your other choices.",
        "estimate": "Estimated cost: about **{total}** ({pp} per person). This is an estimate from Raahi's assumptions, not a quote.",
        "things": "Things to know:",
        "panel": "The plan panel has the details, costs and sources.",
        "heads_up": "Heads up: this route needs at least {n} days.",
    },
    "ur": {
        "great_choice": "Zabardast intikhab: {places}.",
        "q_destinations": "Kahan jana chahte hain (maslan Hunza, Skardu ya Fairy Meadows)?",
        "q_dates": "Kab ja rahe hain? Exact dates sab se behtar hain; abhi sirf mahina bhi chalega.",
        "q_days": "Safar samet kul kitne din hain?",
        "q_travellers": "Kitne log ja rahe hain (aur koi bachay)?",
        "q_budget": "Budget kitna hai rupay mein, aur kya ye sab ka total hai ya fi banda?",
        "assumed": "Maine ye farz kiya: {items}. Kuch alag ho to bata dein.",
        "updated": "Plan update kar diya ({what}) aur baqi sab waisa hi rakha.",
        "estimate": "Andaazan kharcha: **{total}** ({pp} fi banda). Ye Raahi ke andazon se estimate hai, quote nahi.",
        "things": "Ye baatein zehan mein rakhein:",
        "panel": "Poori tafseel, kharcha aur sources plan panel mein hain.",
        "heads_up": "Dhyan dein: is route ke liye kam se kam {n} din chahiye.",
    },
}

ASSUMED_UR = {
    "starting from Islamabad": "Islamabad se rawangi",
    "7 days": "7 din",
    "2 adults": "2 baalig afraad",
    "travelling by road with a hired car": "kiraye ki gaari aur driver ke saath road se safar",
    "mid-range stays": "mid-range hotel",
    "a balanced pace": "na zyada tez na zyada aahista",
    "no travel dates yet (seasonal checks and forecasts need dates)": "abhi dates nahi (mausam aur season check ke liye dates chahiye)",
    "no exact dates yet, only the month (forecasts need dates)": "exact dates nahi, sirf mahina (forecast ke liye dates chahiye)",
}


def p(lang: str, key: str, **kw) -> str:
    table = PHRASES.get(lang) or PHRASES["en"]
    return (table.get(key) or PHRASES["en"][key]).format(**kw)


def assumed_words(lang: str, items: list[str]) -> list[str]:
    return [ASSUMED_UR.get(a, a) for a in items] if lang == "ur" else items
