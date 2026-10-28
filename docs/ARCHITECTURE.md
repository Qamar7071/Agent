# How Raahi works

Raahi plans trips to Northern Pakistan (Gilgit-Baltistan and the Karakoram Highway). A
deterministic planner does the arithmetic (route, days, times, costs). A tool-calling AI
agent talks to the traveller and uses the planner and the live sources as tools. When no AI
model is available, a rule-based "guided" mode uses the same tools. The rule throughout:
facts come from code, data files or live sources with a timestamp, never from the model's
memory, and anything that could not be checked is labelled as such.

## 1. Overview

```mermaid
flowchart LR
  subgraph Browser
    UI[React app<br/>home, /plan, /trips, /destinations/*, /admin]
    LS[(localStorage<br/>workspace, trip keys,<br/>enquiry references)]
  end
  subgraph Server["Flask API (Vercel function or gunicorn)"]
    API[app.py<br/>validation, rate limits,<br/>CORS, security headers]
    AG[agent/runner.py<br/>tool loop + guided mode]
    TL[agent/tools.py<br/>11 validated tools]
    PL[planner.py + budget.py<br/>deterministic]
    SV[services/<br/>weather, roads, routing]
    DB[storage.py]
  end
  LLM[(OpenAI-compatible model<br/>main + backup provider)]
  OM[(Open-Meteo forecast)]
  PMD[(PMD CAP alert feed)]
  OSRM[(OSRM routing)]
  PG[(Postgres or SQLite)]
  DATA[[shared/destinations.json]]

  UI -- /api/* --> API --> AG --> TL
  AG <--> LLM
  TL --> PL & SV & DB
  API --> PL & SV & DB
  SV --> OM & PMD & OSRM
  DB --> PG
  PL --> DATA
  UI --> LS
```

| Folder | What is in it |
|---|---|
| `src/` | React 18 + Vite + Tailwind front end. `pages/`, `components/{home,planner,shared,layout,ui}`, `context/PlannerContext.jsx` (planner state), `lib/` (router, API client, local storage, formatting, SEO). |
| `backend/` | Flask API: `app.py` (routes), `agent/` (runner, tools, prompt, parser, guided mode, LLM client), `planner.py`, `budget.py`, `schemas.py` (pydantic models), `storage.py`, `security.py`, `services/`, `tests/`. |
| `shared/destinations.json` | The one destination dataset used by the API and the website: places, hubs, road legs, seasonal routes, stays, cost assumptions, sources and review dates. Edit this file directly (it was first assembled from the old data files by `scripts/build_shared_data.py`); `backend/tests/test_data.py` checks it. |
| `api/index.py` | Vercel entry point that imports the Flask app. |
| `scripts/` | Image pipeline (`build_images.py`), static page prerendering (`prerender.mjs`), data builder. |
| `e2e/` | Browser tests (`run_e2e.py`) and the accessibility and page-weight audit (`audit.py`). |

## 2. The agent

### One chat message, step by step

1. **Validate** the request (`ChatRequest`: message up to 2,000 characters, at most 12 history
   turns of 1,500 characters reach the model, a structured `state`, an optional saved-trip reference).
2. **Read the message deterministically** (`agent/parser.py`): destinations, origin, days or
   "one day less", travellers ("3 of us", "2 adults and 2 kids"), budget and whether it is per
   person, dates or month, transport, stays, pace, interests, accessibility, food, guide. English
   and Roman Urdu. The result is merged into the **trip state** (`schemas.TripState`), so details
   are never asked twice and are kept across turns even if the model forgets.
3. **AI mode** (when a provider is configured): the model gets the system prompt
   (`agent/prompt.py`: how to work, honesty rules, safety, security, style) and a context block
   (Pakistan time and season, the trip state as JSON, what is still unknown, which values were
   assumed, a compact version of the current itinerary, and any changes made since it was
   built). It may call tools; each call is validated and executed by the server
   (`tools.execute`) and the result goes back to the model. The loop stops when the model
   answers or a limit is reached.
4. **Guided mode** (no provider, or the provider failed before any tool ran): `agent/guided.py`
   recognises the intent (plan, change, weather, road, route, cost, save, booking help,
   suggestions) and calls the same tools, then writes a plain answer from their results.
   The reply carries a notice saying it is guided mode.
5. **Respond** with the reply plus structured results taken from the tools themselves
   (itinerary, forecast, alerts, road status, route, budget, enquiry draft), the updated
   state, a trace of every tool call (name, arguments, ok or error, milliseconds), suggested
   next messages and the time taken. The website draws the plan from these structures, not
   from the model's prose.

### Tools

| Tool | What it does | Source |
|---|---|---|
| `search_destinations` | Suggests places for interests, a month, an altitude limit or no hiking | dataset |
| `get_destination_details` | Altitude, season, access, accessibility, highlights, indicative stays, sources | dataset |
| `get_weather_forecast` | Forecast up to 16 days with risks and confidence, plus official alerts | Open-Meteo, PMD |
| `get_route_information` | Curated distance and realistic drive time, OSRM free-flow figure, Maps link | dataset, OSRM |
| `get_road_status` | What can and cannot be known: always "not verified", with alerts, typical seasonal closures, optional unverified news, official checks | PMD, dataset, Tavily (optional) |
| `estimate_trip_budget` | Line-by-line PKR estimate compared with the budget, with savings | `budget.py` |
| `create_itinerary` | Builds the full day-by-day plan | `planner.py` |
| `update_itinerary` | Changes days, dates, budget, pace, transport, stays, destinations or one day, keeping everything else | `planner.py` |
| `save_trip` | Saves or updates the trip, only when asked. The private key goes to the browser, never to the model | `storage.py` |
| `get_saved_trip` | Reopens the trip open in this browser and rebuilds it with today's data | `storage.py` |
| `create_booking_enquiry` | Opens an enquiry **draft** in the website. It sends nothing; the traveller reviews it, ticks consent and sends it | none |

### Guard rails

| Limit | Default | Setting |
|---|---|---|
| Model turns per message | 6 | `AGENT_MAX_STEPS` |
| Tool calls per message | 10 | `AGENT_MAX_TOOL_CALLS` |
| Whole message deadline | 45 s | `AGENT_DEADLINE_S` |
| Model output per turn | 900 tokens | `LLM_MAX_TOKENS` |
| One tool result shown to the model | 6,000 characters (lists are shortened first) | `AGENT_TOOL_RESULT_CHARS` |
| Request body | 64 KB | `MAX_BODY_BYTES` |
| Chat requests | 12 per minute per visitor | `CHAT_RATE_PER_MIN` |

- Tool arguments are parsed with pydantic models; unknown tools and invalid arguments return
  an error to the model instead of running.
- Only the 11 tools above exist. None of them can fetch an arbitrary URL, run code, read files
  or send messages.
- A message sticks to one provider. If the main provider fails, the backup provider (and any
  fallback models) is tried; a 401 or 403 skips the rest of that provider's models.
- Saved-trip keys, enquiry keys and the admin token are never put in the model's context.

## 3. Planner (`backend/planner.py`)

- **Route**: shortest path (Dijkstra) over curated road legs between hubs (Islamabad, Chilas,
  Gilgit, Karimabad, Skardu, Sost…), using realistic hours, not map averages.
- **Days**: travel is split at towns where an overnight is sensible, with a cap of about 12.5
  hours on the road per day; short moves (under 4 hours) are merged into a sightseeing day.
- **Time of day**: departure times are worked out from the sunset for that date and place
  (NOAA formula) so the car arrives about 45 minutes before dark. Days that risk arriving
  after dark say so. With only a month known, mid-month daylight is used.
- **Feasibility**: minimum days for the route, recommended days per place, buffer days for
  long road trips, day trips (Deosai from Skardu, Khunjerab from Sost or Passu), Fairy Meadows
  and K2 templates (jeep, hike, permits, trek camps).
- **Checks**: seasonal closures (e.g. Deosai and Khunjerab in winter), out-of-season places,
  winter flight cancellations, monsoon landslides, altitude and accessibility warnings, a
  weather alternative for each sightseeing day.
- **Changes** (`apply_changes`) edit the request and rebuild, so every other preference stays.
  Edited or regenerated days are kept by their key (e.g. `hunza:1`).

## 4. Budget engine (`backend/budget.py`)

Every line has a category, a label, an amount, how it was worked out (unit cost × units),
how often it is paid (per trip, per day, per night, per person) and `status: "estimate"`.
It handles group versus per-person budgets, adults and children (children eat less, still
take seats), the number of rooms and vehicles needed, stay level, transport mode, park
entry fees and a 10% contingency. It compares the total with the traveller's budget
(within, tight, over), explains the gap, and suggests savings by rebuilding the plan with
cheaper options. Cost assumptions are in `shared/destinations.json → cost_model` with a
review date; none of them are live prices.

## 5. Weather and roads

- **Weather** (`services/weather.py`): Open-Meteo forecast for the destination's
  coordinates, up to 16 days ahead, with the time it was retrieved. Days more than 7 ahead
  are marked lower confidence; beyond 16 days the app says no forecast exists. The model's
  "current conditions" are labelled as a model value, not an observation. Rain, snow, heat
  and freezing risks become plan warnings with an alternative for that day.
- **Official alerts**: the PMD CAP feed (public RSS of weather warnings), filtered to
  alerts that mention the region and are still in force.
- **Roads** (`services/roads.py`): there is no public live feed for road status in
  Gilgit-Baltistan. The result is always `status: "not_verified"` with the headline
  "Current road status could not be verified.", plus official PMD alerts, the typical
  seasonal window for high routes (from the dataset, labelled typical), unverified news
  reports if Tavily is configured, an experimental model estimate if a KKH model is
  configured, and where to check: NHMP (helpline 130 and its travel advisory page), PMD and
  NDMA. A road is never called open because no closure was found.

## 6. Storage

Two tables, created automatically on first use (`metadata.create_all`, which only adds
missing tables). `python backend/storage.py init` creates them explicitly;
`python backend/storage.py sql` prints the SQL below.

```sql
CREATE TABLE trips (
  id VARCHAR(32) PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL,          -- SHA-256 of the private key
  title VARCHAR(160) NOT NULL,
  request_json TEXT NOT NULL,               -- the validated TripRequest
  itinerary_json TEXT NOT NULL,             -- the plan as shown when saved
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE enquiries (
  id VARCHAR(32) PRIMARY KEY,
  reference VARCHAR(16) NOT NULL UNIQUE,    -- e.g. RAH-7KQ2-M9XD (no 0/O or 1/I)
  token_hash VARCHAR(64) NOT NULL,
  trip_id VARCHAR(32) REFERENCES trips (id) ON DELETE SET NULL,
  name VARCHAR(80) NOT NULL,
  contact_method VARCHAR(16) NOT NULL,      -- email | phone | whatsapp
  contact_value VARCHAR(120) NOT NULL,
  message TEXT,
  request_json TEXT,
  summary VARCHAR(300),
  consent_text TEXT NOT NULL,               -- the exact wording agreed to
  consent_version VARCHAR(20) NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL,              -- new | in_review | contacted | closed | spam
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_enquiries_status_created ON enquiries (status, created_at);
```

- **No accounts.** Creating a trip or an enquiry returns a random private key once. Only its
  SHA-256 hash is stored; reading, changing or deleting needs the key (constant-time
  comparison). The browser keeps the keys in localStorage, so "My trips" works in that browser
  only. Anyone without the key gets "not found".
- **Enquiries** need the consent box ticked; the consent text and version are stored with
  the enquiry. The traveller can check the status or withdraw (delete) it with the key. Admins
  list and update enquiries with `ADMIN_TOKEN`. Enquiries are refused (503, "nothing was
  sent") unless both a database and `ADMIN_TOKEN` are configured.
- **Destinations are not in the database.** They live in `shared/destinations.json` so that
  changes are reviewed in git, carry sources and review dates, and the static pages can be
  built from the same file.
- **Migrations**: this is the first schema. `create_all` does not alter existing tables, so a
  future column change needs a migration tool (Alembic) or a hand-written `ALTER TABLE`.

## 7. API

All responses are JSON. Errors look like `{"error": {"code", "message", "details"}}`.

| Method and path | Purpose | Limit per minute |
|---|---|---|
| `GET /api/health` | Version, AI configured, storage, enquiries open, live services | none |
| `GET /api/destinations`, `GET /api/destinations/<id>` | Dataset | none |
| `GET /api/weather?destination=hunza&start=2026-11-06&days=7` | Forecast | 60 |
| `GET /api/alerts` | PMD alerts for the region | 60 |
| `GET /api/roads?destinations=hunza,skardu&date=2026-11-06` | Road information (always not verified) | 60 |
| `GET /api/route?from=islamabad&to=karimabad` | Route figures | 60 |
| `POST /api/chat` | One agent turn | 12 |
| `POST /api/plan` | Build a plan from a `TripRequest` | 40 |
| `POST /api/plan/update` | Apply changes to a request and rebuild | 40 |
| `POST /api/budget` | Budget only | 40 |
| `POST /api/conditions` | Forecasts and road information for a plan's days | 60 |
| `POST /api/trips`, `GET/PUT/DELETE /api/trips/<id>` | Saved trips (header `X-Trip-Token`) | 6 writes, 60 reads |
| `GET /api/enquiries/consent` | Current consent text and whether enquiries are open | none |
| `POST /api/enquiries`, `GET/DELETE /api/enquiries/<ref>` | Enquiries (header `X-Enquiry-Token`) | 6 writes, 60 reads |
| `GET /api/admin/enquiries`, `PATCH /api/admin/enquiries/<ref>` | Admin (header `Authorization: Bearer <ADMIN_TOKEN>`) | 60 |

Examples (local server on port 5000):

```bash
curl -s localhost:5000/api/health

curl -s -X POST localhost:5000/api/plan -H "Content-Type: application/json" -d '{
  "origin": "islamabad", "destinations": ["hunza", "attabad"], "start_date": "2026-11-06",
  "days": 7, "adults": 2, "budget_pkr": 150000, "budget_basis": "total",
  "transport": "car", "accommodation": "mid", "pace": "balanced"}'

curl -s -X POST localhost:5000/api/plan/update -H "Content-Type: application/json" -d '{
  "request": {"origin": "islamabad", "destinations": ["skardu"], "days": 6, "adults": 2},
  "changes": [{"op": "set", "field": "days", "value": 7}, {"op": "add_destination", "destination": "deosai"}]}'

curl -s -X POST localhost:5000/api/chat -H "Content-Type: application/json" -d '{
  "message": "Plan 6 days in Skardu from Islamabad for 2 people, budget 150000", "history": []}'
```

`/api/plan` returns `{"itinerary": {...}}` with `title`, `summary`, `feasibility`, `days`
(each with `date`, `moves` with departure and arrival times, `overnight`, `activities`,
`risks`, `weather_alternative`, `cost`, `sources`), `stays`, `budget`, `warnings`
(`level`, `code`, `message`), `sources`, `data_reviewed` and `generated_at`.

## 8. Security

- Secrets only in server environment variables; nothing secret is built into the website.
- Every request body is validated with pydantic (`extra="forbid"` where it matters); body size
  limit; per-visitor rate limits per bucket (in memory, per server instance).
- CORS limited to `ALLOWED_ORIGINS`; security headers on every response (also set by
  `vercel.json` for static files).
- Private keys hashed at rest; admin token compared in constant time.
- Enquiries: consent required, honeypot field against bots, the traveller can withdraw.
- Prompt injection: tool results and saved notes are marked as data in the prompt, the model
  can only use the 11 tools, arguments are validated, and anything consequential (sending an
  enquiry) needs the traveller to act in the website.
- Logs record method, path, status and timing, not request bodies or personal details.
- Assistant text is rendered with a small safe Markdown renderer (no HTML injection; only
  `http(s)` links).

## 9. Front end

- Routes: `/` (home), `/plan` (chat and plan side by side; Chat and Plan tabs on phones),
  `/trips` (saved trips and enquiries in this browser), `/destinations/<id>`, `/admin`.
  A small History-API router; pages other than home load on demand.
- `PlannerContext` keeps the conversation, trip state and itinerary in localStorage
  (`raahi:workspace:v2`), so a refresh does not lose the plan.
- `npm run build` also prerenders static HTML for each destination page (with JSON-LD),
  `sitemap.xml` and `robots.txt`, so the content can be crawled without JavaScript.
- Photos: responsive WebP sizes made by `scripts/build_images.py`; alt text, credits and
  focal points in `src/data/photos.meta.json`.

## 10. Tests

| Command | What it covers |
|---|---|
| `npm run test:api` | Backend unit and API tests with pytest: data, planner, budget, services (with recorded PMD fixtures and fake HTTP), storage (SQLite; Postgres when `RAAHI_TEST_PG_URL` is set), API, parser, and the agent with a scripted fake model, including the 10 evaluation scenarios. All offline. |
| `npm run test:e2e` | 16 browser checks against a running server (Playwright + Chromium). |
| `npm run audit:a11y` | axe-core accessibility audit of 38 page states at phone and desktop sizes, plus page weight. |

Tests use fakes for every external service; passing them shows the code handles those
responses, not that the live services or a real AI model behave the same way.
