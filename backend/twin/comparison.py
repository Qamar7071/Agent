"""Comparison engine: what changes between the original trip and a simulated one."""
import data
from agents.common import flight_km, great_circle_km, leg_keys_by_day, road_km, travel_hours
from twin import segments


def _altitude(key: str) -> int | None:
    d = data.destination(key)
    if d:
        return d["altitude_m"]
    h = data.dataset()["hubs"].get(key) or {}
    return h.get("altitude_m")


def profile(plan: dict) -> list[dict]:
    """Points along the trip for the Twin's route view: distance travelled and approximate altitude."""
    first = next((m for d in plan["days"] for m in d.get("moves", [])), None)
    if not first:
        return []
    km = 0.0
    pts = [{"day": 0, "place": first["from"], "name": first["from_name"], "km": 0, "altitude_m": _altitude(first["from"]),
            "mode": None}]
    for d in plan["days"]:
        for m in d.get("moves", []):
            if m["mode"] == "flight":
                km += (great_circle_km(m["from"], m["to"]) or 0) * 1.1
            else:
                km += m.get("km") or 0
            pts.append({"day": d["day"], "place": m["to"], "name": m["to_name"], "km": round(km),
                        "altitude_m": _altitude(m["to"]), "mode": m["mode"]})
            if m.get("round_trip"):
                km += m.get("km") or 0
                pts.append({"day": d["day"], "place": m["from"], "name": m["from_name"], "km": round(km),
                            "altitude_m": _altitude(m["from"]), "mode": m["mode"]})
        if not d.get("moves"):
            pts.append({"day": d["day"], "place": pts[-1]["place"], "name": pts[-1]["name"], "km": round(km),
                        "altitude_m": pts[-1]["altitude_m"], "mode": "stay"})
    return pts


def summarize(plan: dict, safety: dict | None = None, eco: dict | None = None) -> dict:
    lo, hi = travel_hours(plan)
    keys = set().union(*leg_keys_by_day(plan).values()) if plan["days"] else set()
    out = {
        "title": plan["title"], "days": len(plan["days"]), "feasible": plan["feasibility"]["ok"],
        "destinations": plan["request"]["destinations"], "transport": plan["request"]["transport"],
        "accommodation": plan["request"]["accommodation"], "travellers": plan["budget"]["travellers"]["total"],
        "total_pkr": plan["budget"]["total"], "per_person_pkr": plan["budget"]["per_person"],
        "budget_status": plan["budget"]["comparison"]["status"], "by_category": plan["budget"]["by_category"],
        "travel_hours": [lo, hi], "road_km": road_km(plan), "flight_km": flight_km(plan),
        "roads": [s["name"] for s in segments.using(keys)],
        "profile": profile(plan),
        "stops": [{"day": d["day"], "date": d.get("date"), "type": d["type"], "title": d["title"],
                   "overnight": (d.get("overnight") or {}).get("name"),
                   "moves": [f"{m['from_name']} → {m['to_name']}" for m in d.get("moves", [])],
                   "hours": max([m["hours"][1] for m in d.get("moves", []) if m.get("hours")] or [0])}
                  for d in plan["days"]],
    }
    if safety:
        out["risk"] = {"score": safety["overall"]["score"], "category": safety["overall"]["category"],
                       "confidence": safety["confidence"],
                       "by_day": [{"day": d["day"], "score": d["score"], "category": d["category"]} for d in safety["days"]]}
    if eco:
        out["eco_kg_co2e"] = eco["current"]["kg_co2e"]
        out["eco_kg_per_person"] = eco["current"]["kg_co2e_per_person"]
    return out


def _delta(a, b):
    return None if a is None or b is None else b - a


def compare(base: dict, sim: dict) -> dict:
    """Day-by-day and headline differences between two summaries."""
    days = []
    for i in range(max(len(base["stops"]), len(sim["stops"]))):
        a = base["stops"][i] if i < len(base["stops"]) else None
        b = sim["stops"][i] if i < len(sim["stops"]) else None
        if a and b:
            changed = (a["title"] != b["title"] or a["overnight"] != b["overnight"] or a["moves"] != b["moves"])
            status = "changed" if changed else "same"
        else:
            status = "added" if b else "removed"
        days.append({"day": i + 1, "status": status, "original": a, "simulated": b})
    cats = sorted(set(base["by_category"]) | set(sim["by_category"]))
    risk_a, risk_b = base.get("risk"), sim.get("risk")
    out = {
        "days": days,
        "days_changed": sum(1 for d in days if d["status"] != "same"),
        "length": {"original": base["days"], "simulated": sim["days"], "delta": sim["days"] - base["days"]},
        "cost": {"original": base["total_pkr"], "simulated": sim["total_pkr"],
                 "delta": sim["total_pkr"] - base["total_pkr"],
                 "per_person_delta": sim["per_person_pkr"] - base["per_person_pkr"],
                 "by_category": [{"category": c, "original": base["by_category"].get(c, 0),
                                  "simulated": sim["by_category"].get(c, 0),
                                  "delta": sim["by_category"].get(c, 0) - base["by_category"].get(c, 0)} for c in cats]},
        "time": {"original": base["travel_hours"], "simulated": sim["travel_hours"],
                 "delta": [round(sim["travel_hours"][0] - base["travel_hours"][0], 1),
                           round(sim["travel_hours"][1] - base["travel_hours"][1], 1)],
                 "road_km_delta": sim["road_km"] - base["road_km"]},
        "route": {"removed": [r for r in base["roads"] if r not in sim["roads"]],
                  "added": [r for r in sim["roads"] if r not in base["roads"]],
                  "transport": [base["transport"], sim["transport"]]},
        "destinations": {"removed": [d for d in base["destinations"] if d not in sim["destinations"]],
                         "added": [d for d in sim["destinations"] if d not in base["destinations"]]},
    }
    if risk_a and risk_b:
        out["risk"] = {"original": risk_a["score"], "simulated": risk_b["score"],
                       "delta": risk_b["score"] - risk_a["score"],
                       "categories": [risk_a["category"], risk_b["category"]]}
    if base.get("eco_kg_co2e") and sim.get("eco_kg_co2e"):
        out["eco"] = {"original": base["eco_kg_co2e"], "simulated": sim["eco_kg_co2e"],
                      "delta": [sim["eco_kg_co2e"][0] - base["eco_kg_co2e"][0],
                                sim["eco_kg_co2e"][1] - base["eco_kg_co2e"][1]]}
    out["budget_status"] = [base["budget_status"], sim["budget_status"]]
    out["no_change"] = (out["days_changed"] == 0 and out["cost"]["delta"] == 0 and base["budget_status"] == sim["budget_status"] and not out["route"]["removed"]
                        and not out["route"]["added"] and (out.get("risk") or {}).get("delta", 0) == 0)
    return out
