"""Validated shapes for everything that comes in from outside: API bodies, the trip form,
chat requests and the agent's tool arguments. Nothing reaches the planner, storage or a
tool without passing through one of these models.
"""
import re
from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

import data
from clock import today_pk

Transport = Literal["car", "bus", "flight"]
StayLevel = Literal["budget", "mid", "premium"]
Pace = Literal["relaxed", "balanced", "active"]
BudgetBasis = Literal["total", "per_person"]
AccessNeed = Literal["limited_mobility", "wheelchair", "altitude_sensitive", "elderly", "infant"]

Text120 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
DayKey = Annotated[str, StringConstraints(pattern=r"^[a-z0-9:>\-]{1,60}$")]
HexId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")]

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_INTEREST = re.compile(r"[^a-z &\-]")

# Common ways people describe what they like, mapped to one word the planner understands.
INTEREST_SYNONYMS = {
    "mountain": "mountains", "peaks": "mountains", "lake": "lakes", "photo": "photography", "photos": "photography",
    "hiking": "trekking", "hike": "trekking", "trek": "trekking", "treks": "trekking", "history": "culture",
    "forts": "culture", "heritage": "culture", "local food": "food", "cuisine": "food", "peaceful": "relaxation",
    "quiet": "relaxation", "relax": "relaxation", "kids": "family", "wildlife": "nature", "stars": "stargazing",
}


def normalise_interests(values: list[str]) -> list[str]:
    out = []
    for item in values:
        word = _INTEREST.sub("", str(item).lower()).strip()[:30]
        word = INTEREST_SYNONYMS.get(word, word)
        if word and word not in out:
            out.append(word)
    return out


def clean_text(value: str | None, max_len: int) -> str | None:
    """Strip control characters and trim. Keeps newlines; never raises."""
    if value is None:
        return None
    return _CONTROL.sub("", str(value)).strip()[:max_len]


class DayEdit(BaseModel):
    """A traveller's own change to one day. Keyed by the day's stable key, so it survives re-planning."""
    model_config = ConfigDict(extra="forbid")
    title: Text120 | None = None
    activities: list[Text120] | None = Field(default=None, max_length=8)
    note: Text300 | None = None
    variant: int = Field(default=0, ge=0, le=9)


class TripRequest(BaseModel):
    """Everything the planner needs. Defaults are sensible but the agent tells the traveller
    which ones it assumed."""
    model_config = ConfigDict(extra="ignore")

    origin: str = "Islamabad"
    destinations: list[str] = Field(default_factory=list, max_length=8)
    start_date: date | None = None
    travel_month: int | None = Field(default=None, ge=1, le=12)   # when only the month is known
    days: int = Field(default=7, ge=1, le=30)
    adults: int = Field(default=2, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=12)
    budget_pkr: int | None = Field(default=None, ge=0, le=20_000_000)
    budget_basis: BudgetBasis = "total"
    transport: Transport = "car"
    accommodation: StayLevel = "mid"
    pace: Pace = "balanced"
    interests: list[str] = Field(default_factory=list, max_length=10)
    accessibility: list[AccessNeed] = Field(default_factory=list, max_length=5)
    accessibility_note: Text300 | None = None
    food: Text120 | None = None
    guide: bool = False
    day_edits: dict[DayKey, DayEdit] = Field(default_factory=dict, max_length=40)

    @model_validator(mode="before")
    @classmethod
    def _legacy_fields(cls, v: Any) -> Any:
        """Accept the old /api/plan body: from, travelers, budget."""
        if isinstance(v, dict):
            v = dict(v)
            if "origin" not in v and "from" in v:
                v["origin"] = v.pop("from")
            if "adults" not in v and "travelers" in v:
                v["adults"] = v.pop("travelers")
            if "budget_pkr" not in v and "budget" in v:
                v["budget_pkr"] = v.pop("budget") or None
            for key in ("start_date", "budget_pkr", "food", "accessibility_note"):
                if v.get(key) == "":
                    v[key] = None
        return v

    @field_validator("origin")
    @classmethod
    def _origin(cls, v: str) -> str:
        names = {n.lower(): n for n in data.origins()}
        hit = names.get(str(v).strip().lower())
        if not hit:
            raise ValueError(f"Unknown starting city. Choose one of: {', '.join(data.origins())}.")
        return hit

    @field_validator("destinations")
    @classmethod
    def _destinations(cls, v: list[str]) -> list[str]:
        out = []
        for item in v:
            did = data.resolve_destination(str(item)[:60])
            if not did:
                raise ValueError(f"Unknown destination '{str(item)[:40]}'. Raahi covers: "
                                 f"{', '.join(d['name'] for d in data.dataset()['destinations'])}.")
            if did not in out:
                out.append(did)
        return out

    @field_validator("start_date")
    @classmethod
    def _start(cls, v: date | None) -> date | None:
        if v and v > today_pk() + timedelta(days=730):
            raise ValueError("Start date is more than two years away.")
        return v

    @field_validator("interests")
    @classmethod
    def _interests(cls, v: list[str]) -> list[str]:
        return normalise_interests(v)

    @property
    def people(self) -> int:
        return self.adults + self.children


# ── Itinerary changes ──────────────────────────────────────────────────────────────
SettableField = Literal["origin", "start_date", "travel_month", "days", "adults", "children", "budget_pkr", "budget_basis",
                        "transport", "accommodation", "pace", "interests", "accessibility",
                        "accessibility_note", "food", "guide"]


class SetOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["set"]
    field: SettableField
    value: Any = None


class AddDestinationOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["add_destination"]
    destination: Text120


class RemoveDestinationOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["remove_destination"]
    destination: Text120


class EditDayOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["edit_day"]
    key: DayKey
    title: Text120 | None = None
    activities: list[Text120] | None = Field(default=None, max_length=8)
    note: Text300 | None = None


class ResetDayOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["reset_day"]
    key: DayKey


class RegenerateDayOp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    op: Literal["regenerate_day"]
    key: DayKey


UpdateOp = Annotated[Union[SetOp, AddDestinationOp, RemoveDestinationOp, EditDayOp, ResetDayOp, RegenerateDayOp],
                     Field(discriminator="op")]


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: TripRequest
    changes: list[UpdateOp] = Field(min_length=1, max_length=20)


# ── Chat ───────────────────────────────────────────────────────────────────────────
class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=4000)]


class TripState(BaseModel):
    """What the agent has learned about the trip so far (structured memory).

    Every field is optional: None means "not known yet". The client sends it back with each
    message, the server validates it, and tools update it.
    """
    model_config = ConfigDict(extra="ignore")

    origin: str | None = None
    destinations: list[str] = Field(default_factory=list, max_length=8)
    start_date: date | None = None
    month: int | None = Field(default=None, ge=1, le=12)      # when only a month is known
    days: int | None = Field(default=None, ge=1, le=30)
    adults: int | None = Field(default=None, ge=1, le=20)
    children: int | None = Field(default=None, ge=0, le=12)
    budget_pkr: int | None = Field(default=None, ge=0, le=20_000_000)
    budget_basis: BudgetBasis | None = None
    transport: Transport | None = None
    accommodation: StayLevel | None = None
    pace: Pace | None = None
    interests: list[str] = Field(default_factory=list, max_length=10)
    accessibility: list[AccessNeed] = Field(default_factory=list, max_length=5)
    food: Text120 | None = None
    guide: bool | None = None
    day_edits: dict[DayKey, DayEdit] = Field(default_factory=dict, max_length=40)
    has_itinerary: bool = False
    assumed: list[Annotated[str, StringConstraints(max_length=120)]] = Field(default_factory=list, max_length=12)
    plan_request: dict | None = None      # the request behind the itinerary currently shown

    @field_validator("plan_request")
    @classmethod
    def _plan_request(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        return TripRequest.model_validate(v).model_dump(mode="json")     # re-validate what the client sent

    @field_validator("origin")
    @classmethod
    def _origin(cls, v: str | None) -> str | None:
        if v is None:
            return None
        names = {n.lower(): n for n in data.origins()}
        return names.get(str(v).strip().lower())

    @field_validator("destinations")
    @classmethod
    def _destinations(cls, v: list[str]) -> list[str]:
        out = []
        for item in v:
            did = data.resolve_destination(str(item)[:60])
            if did and did not in out:
                out.append(did)
        return out

    @field_validator("interests")
    @classmethod
    def _interests(cls, v: list[str]) -> list[str]:
        return normalise_interests(v)

    def missing(self) -> list[str]:
        """Details that change the plan materially and are still unknown, most important first."""
        out = []
        if not self.destinations:
            out.append("destinations")
        if not self.start_date and not self.month:
            out.append("dates")
        if not self.days:
            out.append("days")
        if not self.adults:
            out.append("travellers")
        if self.budget_pkr is None:
            out.append("budget")
        return out

    def to_request(self) -> tuple[TripRequest, list[str]]:
        """A plannable request plus the list of defaults that had to be assumed."""
        assumed = []
        values: dict[str, Any] = {}
        defaults = {"origin": ("Islamabad", "starting from Islamabad"), "days": (7, "7 days"),
                    "adults": (2, "2 adults"), "transport": ("car", "travelling by road with a hired car"),
                    "accommodation": ("mid", "mid-range stays"), "pace": ("balanced", "a balanced pace")}
        for key, (default, label) in defaults.items():
            value = getattr(self, key)
            if value is None:
                values[key] = default
                assumed.append(label)
            else:
                values[key] = value
        values.update(destinations=self.destinations, start_date=self.start_date,
                      travel_month=None if self.start_date else self.month,
                      children=self.children or 0, budget_pkr=self.budget_pkr,
                      budget_basis=self.budget_basis or "total", interests=self.interests,
                      accessibility=self.accessibility, food=self.food, guide=bool(self.guide),
                      day_edits=self.day_edits)
        if not self.start_date and not self.month:
            assumed.append("no travel dates yet (seasonal checks and forecasts need dates)")
        elif not self.start_date:
            assumed.append("no exact dates yet, only the month (forecasts need dates)")
        return TripRequest.model_validate(values), assumed

    def plan(self) -> TripRequest | None:
        return TripRequest.model_validate(self.plan_request) if self.plan_request else None

    def changes_since_plan(self) -> dict[str, tuple]:
        """Details the traveller has stated that differ from the itinerary currently shown."""
        current = self.plan()
        if not current:
            return {}
        wanted, _ = self.to_request()
        out = {}
        for key in ("origin", "destinations", "start_date", "travel_month", "days", "adults", "children",
                    "budget_pkr", "budget_basis", "transport", "accommodation", "pace", "interests",
                    "accessibility", "food", "guide"):
            a, b = getattr(current, key), getattr(wanted, key)
            if key == "travel_month" and wanted.start_date:
                continue
            if a != b and not (key in ("interests", "accessibility") and set(b) <= set(a)):
                out[key] = (a, b)
        return out

    def absorb(self, req: TripRequest) -> "TripState":
        """Take the values of a request the traveller (or agent) has just planned with."""
        upd = req.model_dump()
        upd["has_itinerary"] = True
        upd["plan_request"] = req.model_dump(mode="json")
        upd["month"] = req.start_date.month if req.start_date else req.travel_month
        merged = self.model_dump()
        merged.update({k: v for k, v in upd.items() if k in TripState.model_fields})
        return TripState.model_validate(merged)       # validated, so day edits stay DayEdit objects


class TripRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: HexId
    token: Annotated[str, StringConstraints(min_length=16, max_length=100)]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
    state: TripState | None = None
    trip: TripRef | None = None


# ── Agents, Travel Twin, Guardian ────────────────────────────────────────────────────
AgentIntent = Literal["plan", "safety", "packing", "eco", "budget", "stays", "research"]
ScenarioType = Literal["road_closed", "heavy_snow", "budget_change", "days_change", "destination_closed",
                       "group_change", "more_adventure"]


class MemoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: bool = False
    preferences: dict[str, Any] = Field(default_factory=dict, max_length=10)
    trip_id: str | None = Field(default=None, max_length=40)
    active_trip_id: str | None = Field(default=None, max_length=40)


class AgentRunIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    request: TripRequest | None = None
    state: TripState | None = None
    intent: AgentIntent | None = None
    memory: MemoryIn | None = None


class ScenarioIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: ScenarioType
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = "Scenario"
    segment: Annotated[str, StringConstraints(max_length=40)] | None = None
    destination: Annotated[str, StringConstraints(max_length=40)] | None = None
    from_day: int | None = Field(default=None, ge=1, le=30)
    percent: int | None = Field(default=None, ge=-90, le=200)
    delta: int | None = Field(default=None, ge=-10, le=10)
    add: int | None = Field(default=None, ge=1, le=10)
    set: int | None = Field(default=None, ge=1, le=20)


class TwinSimulateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: TripRequest
    scenario: ScenarioIn | None = None
    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class GuardianIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: TripRequest
    previous: dict[str, Any] | None = None


# ── Saved trips and enquiries ──────────────────────────────────────────────────────
class TripSave(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Text120 | None = None
    request: TripRequest


ContactMethod = Literal["email", "phone", "whatsapp"]
_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[a-zA-Z]{2,}$")
_PHONE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}[0-9]$")
CONSENT_VERSION = "2026-10-27"
CONSENT_TEXT = ("I agree that Raahi stores this enquiry (my name, contact details, message and trip plan) so the "
                "Raahi team can review it and contact me about this trip. This is not a booking: nothing is reserved "
                "or paid, and my details are not shared with any hotel or operator without asking me first. I can "
                "withdraw the enquiry at any time.")


class EnquiryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    contact_method: ContactMethod
    contact_value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=120)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    request: TripRequest | None = None
    trip: TripRef | None = None
    consent: bool
    consent_version: str = CONSENT_VERSION
    website: str | None = None      # honeypot field: real people leave it empty

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("Please tick the consent box so we may store your enquiry.")
        return v

    @model_validator(mode="after")
    def _contact(self) -> "EnquiryIn":
        if self.contact_method == "email":
            if not _EMAIL.match(self.contact_value):
                raise ValueError("Please enter a valid email address.")
        elif not _PHONE.match(self.contact_value):
            raise ValueError("Please enter a valid phone number (digits, optional + at the start).")
        self.name = clean_text(self.name, 80) or ""
        self.message = clean_text(self.message, 1000)
        return self


EnquiryStatus = Literal["new", "in_review", "contacted", "closed", "spam"]


class EnquiryAdminUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: EnquiryStatus | None = None
    admin_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


# ── Safar Saathi (trip companion) ──────────────────────────────────────────────────
ExpenseCategory = Literal["stay", "food", "transport", "activities", "shopping", "other"]
MemberId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]{1,12}$")]
ClientUuid = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
MAX_RUPEES = 10_000_000


class Member(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: MemberId
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    active: bool = True

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = clean_text(v, 40)
        if not v:
            raise ValueError("Every member needs a name.")
        return v


class Adjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    altId: Literal["stay_down", "bus"]
    fromDay: int = Field(ge=1, le=60)
    appliedAt: datetime | None = None


class CompanionSettings(BaseModel):
    """What the group set when they pressed Start trip. No health or contact details."""
    model_config = ConfigDict(extra="forbid")
    members: list[Member] = Field(min_length=1, max_length=20)
    budgetTotal: int | None = Field(default=None, ge=0, le=MAX_RUPEES * 10)
    budgetBasis: Literal["total", "per_person"] = "total"
    startDate: date | None = None
    language: Literal["en", "ur"] = "en"
    adjustments: list[Adjustment] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _unique(self) -> "CompanionSettings":
        ids = [m.id for m in self.members]
        if len(ids) != len(set(ids)):
            raise ValueError("Member ids must be unique.")
        return self


class ExpenseIn(BaseModel):
    model_config = ConfigDict(extra="ignore")      # phones may add local fields such as syncStatus
    id: ClientUuid
    amountPkr: int = Field(ge=1, le=MAX_RUPEES)
    category: ExpenseCategory
    paidBy: MemberId
    splitAmong: list[MemberId] = Field(default_factory=list, max_length=20)
    note: Text120 | None = None
    dayIndex: int = Field(ge=0, le=61)
    createdAt: datetime
    updatedAt: datetime
    deleted: bool = False

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        return clean_text(v, 120) or None

    @field_validator("createdAt", "updatedAt")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("Times must include a time zone (ISO 8601 with Z or an offset).")
        return v


class ExpenseSync(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expenses: list[ExpenseIn] = Field(default_factory=list, max_length=200)


class NudgeWordingIn(BaseModel):
    """The rule-based nudge text to reword. The numbers in it must survive unchanged."""
    model_config = ConfigDict(extra="forbid")
    ruleId: Literal["R1", "R2", "R3", "R4"]
    language: Literal["en", "ur"] = "en"
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]


# ── Group Room ──────────────────────────────────────────────────────────────────────
TripType = Literal["friends", "family", "couple", "solo"]
Interest = Literal["mountains", "lakes", "culture", "food", "photography", "trekking", "relaxation", "family"]
NoGo = Literal["long_drives", "high_altitude", "hikes", "camping", "early_starts"]
Need = Literal["altitude", "breathing", "motion_sickness", "limited_walking", "food_vegetarian", "food_mild",
               "food_allergy"]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


def _clean_name(v: str) -> str:
    v = clean_text(v, 40)
    if not v:
        raise ValueError("Please enter a name.")
    return v


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tripId: HexId
    tripType: TripType = "friends"
    name: PersonName
    _n = field_validator("name")(classmethod(lambda cls, v: _clean_name(v)))


class GroupJoin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: PersonName
    _n = field_validator("name")(classmethod(lambda cls, v: _clean_name(v)))


class MemberProfile(BaseModel):
    """A member's public answers. The group sees them only as totals."""
    model_config = ConfigDict(extra="forbid")
    interests: list[Interest] = Field(default_factory=list, max_length=8)
    budget_comfort: Literal["tight", "medium", "comfortable"] | None = None
    pace: Literal["relaxed", "balanced", "active"] | None = None
    must_do: list[str] = Field(default_factory=list, max_length=8)
    no_go: list[NoGo] = Field(default_factory=list, max_length=5)

    @field_validator("must_do")
    @classmethod
    def _places(cls, v: list[str]) -> list[str]:
        out = list(dict.fromkeys(d for d in v if data.destination(d)))
        if len(out) != len(set(v)):
            raise ValueError("Unknown place in must-do.")
        return out


class NeedsIn(BaseModel):
    """Private comfort needs. Stored without a link to the member; never a diagnosis."""
    model_config = ConfigDict(extra="forbid")
    codes: list[Need] = Field(default_factory=list, max_length=7)
    show_name: bool = False


class VoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    option: Literal["A", "B", "C"] | None = None


class ConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    option: Literal["A", "B", "C"]
