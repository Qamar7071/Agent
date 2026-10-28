"""Budget engine: transparent lines, correct sums, honest labels, useful savings."""
import planner
from schemas import TripRequest


def budget(**kw):
    return planner.build(TripRequest.model_validate(kw))["budget"]


def test_lines_add_up_and_are_all_estimates():
    b = budget(destinations=["hunza"], days=7, adults=2, budget_pkr=200000)
    assert b["total"] == round((b["subtotal"] + b["contingency"]) / 100) * 100
    assert abs(sum(l["amount"] for l in b["lines"]) - b["total"]) <= 100
    assert b["status"] == "estimate" and b["verified"] is False
    assert all(l["verified"] is False and l["quantity"] for l in b["lines"])
    assert {l["basis"] for l in b["lines"]} <= {"whole group", "per person"}
    assert "not a quote" in b["note"].lower() or "Not a quote" in b["note"]


def test_contingency_is_ten_percent_of_subtotal():
    b = budget(destinations=["skardu"], days=6)
    assert abs(b["contingency"] - b["subtotal"] * 0.10) <= 100


def test_per_person_budget_is_compared_per_person():
    total_basis = budget(destinations=["hunza"], days=7, adults=2, budget_pkr=100000, budget_basis="total")
    pp_basis = budget(destinations=["hunza"], days=7, adults=2, budget_pkr=100000, budget_basis="per_person")
    assert total_basis["comparison"]["basis"] == "total"
    assert pp_basis["comparison"]["basis"] == "per_person"
    assert pp_basis["comparison"]["budget_total_equivalent"] == 200000
    assert pp_basis["comparison"]["difference"] < total_basis["comparison"]["difference"]


def test_children_eat_less_and_share_rooms():
    adults_only = budget(destinations=["hunza"], days=6, adults=2, children=0)
    family = budget(destinations=["hunza"], days=6, adults=2, children=2)
    food = lambda b: next(l["amount"] for l in b["lines"] if l["id"] == "food")  # noqa: E731
    rooms = lambda b: next(l["amount"] for l in b["lines"] if l["id"] == "rooms")  # noqa: E731
    assert food(family) == round(food(adults_only) * 1.6 / 100) * 100
    assert rooms(family) == rooms(adults_only)        # 2 adults + 2 children fit one family room


def test_over_budget_produces_ranked_savings():
    b = budget(destinations=["hunza"], days=7, adults=2, budget_pkr=80000, accommodation="premium")
    assert b["comparison"]["status"] == "over"
    assert b["savings"] and all(s["saves_pkr"] > 0 for s in b["savings"])
    assert b["savings"] == sorted(b["savings"], key=lambda s: -s["saves_pkr"])
    assert any(s["change"] == {"accommodation": "budget"} for s in b["savings"])


def test_within_budget_has_no_savings_section():
    b = budget(destinations=["hunza"], days=7, adults=2, budget_pkr=10_000_000)
    assert b["comparison"]["status"] == "within" and "savings" not in b


def test_transport_modes_change_the_lines():
    car = budget(destinations=["hunza"], days=7)
    bus = budget(destinations=["hunza"], days=7, transport="bus")
    fly = budget(destinations=["hunza"], days=7, transport="flight")
    ids = lambda b: {l["id"] for l in b["lines"]}  # noqa: E731
    assert "vehicle" in ids(car) and "coach" in ids(bus) and "flights" in ids(fly)
    assert bus["total"] < car["total"]
    flights = next(l for l in fly["lines"] if l["id"] == "flights")
    assert flights["units"] == 2 and flights["basis"] == "per person"


def test_park_entry_is_charged_once_per_person():
    b = budget(origin="Skardu", destinations=["skardu", "deosai"], days=5, adults=3)
    entry = next(l for l in b["lines"] if l["id"] == "entry-deosai")
    assert entry["amount"] == 3 * 500 and entry["frequency"] == "once"


def test_k2_lists_operator_costs_as_not_included():
    b = budget(origin="Skardu", destinations=["k2"], days=16)
    assert any("K2" in x for x in b["not_included"])
    assert any(l["id"] == "camping" for l in b["lines"])
