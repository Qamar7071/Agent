"""Named road sections (shared/destinations.json → road_segments) and the legs they cover."""
import re

import data


def all_segments() -> list[dict]:
    return data.dataset()["road_segments"]["segments"]


def get(seg_id: str) -> dict | None:
    return next((s for s in all_segments() if s["id"] == seg_id), None)


def find(text: str) -> dict | None:
    """The road section a phrase refers to ('Khunjerab route', 'KKH between Gilgit and Hunza', 'Babusar')."""
    t = " " + re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()) + " "
    words = set(t.split())
    best, best_score = None, (0, 0)
    for s in all_segments():
        for alias in [s["id"].replace("-", " "), s["name"].lower(), *s["aliases"]]:
            a = re.sub(r"[^a-z0-9 ]+", " ", alias.lower()).strip()
            tokens = [w for w in a.split() if w not in ("to", "the", "road", "route")]
            if not a:
                continue
            if f" {a} " in t:
                score = (len(tokens) + 1, len(a))
            elif len(tokens) >= 2 and set(tokens) <= words:
                score = (len(tokens), len(a))
            else:
                continue
            if score > best_score:
                best, best_score = s, score
    return best


def using(leg_keys: set[str]) -> list[dict]:
    return [s for s in all_segments() if set(s["legs"]) & leg_keys]
