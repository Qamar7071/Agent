# Raahi audit (before the upgrade)

> This describes the project as it was found. What was built afterwards is in [ARCHITECTURE.md](ARCHITECTURE.md) and the README.

Audited on 2026-10-27 against `main` @ `1054137` and the live deployment
https://north-kappa-ivory.vercel.app/. Everything below was checked by running the code,
building it, or requesting the live site. "Works" means it was observed working, not that a
button exists.

## 1. Stack found

| Area | What exists |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3, single page (`src/App.jsx`), sections scrolled by anchor. No router. Icons: lucide-react. |
| State | One React context (`src/context/AppContext.jsx`) for chat, planner requests, saved destinations (localStorage). |
| Backend | Flask app in `backend/` (`app.py`, `agent.py`, `tools.py`, `data.py`): `POST /api/chat`, `POST /api/plan`, `GET /api/health`; also serves `dist/`. |
| AI | Any OpenAI-compatible API via `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL` (default OpenAI gpt-4o-mini). The model is asked for a JSON reply; **no tool calling**. |
| Data | Destination facts duplicated in `src/data/destinations.js` + `src/data/logistics.js` (frontend) and `backend/data.py`. No database. |
| Hosting | Vercel (static build only) + `render.yaml`/`Procfile` for a Render deployment of the Flask app. |

## 2. Features that genuinely work

- Homepage sections render (hero, destinations, seasons, safety, footer); responsive layout with no horizontal scroll at 390 px.
- Live weather in the browser from Open-Meteo (keyless, CORS).
- Deterministic trip planner (`backend/tools.py: build_plan` and its JS twin `src/lib/offlinePlanner.js`): orders stops along the road network, adds travel days, warns when days are too few, itemised PKR budget with shown assumptions.
- Offline "guided" chat flow (`src/lib/planFlow.js`) that asks one question at a time when no backend answers.
- Safe markdown rendering of assistant text (no `innerHTML`).
- Keyboard focus styles, focus trap in the assistant sheet, `prefers-reduced-motion` support.

## 3. Partially implemented

- **AI chat**: implemented in `backend/agent.py`, but it is a single prompt-in/JSON-out call. The model cannot call tools; live weather is pasted into the prompt. Itineraries returned by the model are not validated against the planner.
- **Budget**: transparent but only one interpretation of "budget" (total). "PKR 30,000 per person" vs "for the group" is not distinguished.
- **Stays**: named properties with price ranges are hard-coded and labelled "indicative", but have no source or review date.
- **Road status**: only links to PMD/NDMA/NHA. Nothing is retrieved. (Honest, but not a feature.)
- **Saved destinations**: a heart list in localStorage only. No saved trips.

## 4. Missing

- Backend on the live site: **`/api/chat`, `/api/plan`, `/api/health` all return Vercel 404** (checked 2026-10-27). The AI agent has never run in production; every visitor gets the offline rule-based guide.
- Tool-using agent loop, itinerary editing through chat, structured trip state.
- Persistent storage (no database), saved trips, booking enquiries, admin review.
- Road-status module, official alert feed, route distances from a routing service.
- Dedicated planner workspace; booking enquiry form; trust/data-source section with freshness.
- SEO: no sitemap, no robots.txt, no crawlable destination pages (all content is client-rendered).
- Automated tests (none in the repo).

## 5. Bugs and risks

| # | Severity | Finding |
|---|---|---|
| 1 | High | Live site has no backend (see §4). The status pill says "Online" until the first message fails. |
| 2 | High | Hero image `src/assets/destinations/hero.png` is a stock photo of a tropical karst lake (Thailand-style), captioned "Gilgit-Baltistan, Pakistan" with alt text "Turquoise Attabad Lake…". Misleading, and its licence is unknown. It is also a 2.7 MB PNG. |
| 3 | Medium | Bundled destination photos have no credits or licences recorded (EXIF shows other people's names: "Imran Shah", "ikram/Malkera", "JANU"). The footer credit list only covers remote Commons files, so the bundled photos are uncredited. |
| 4 | Medium | Page weight: 8.5 MB transferred on a full scroll (measured with Playwright); images are unoptimised JPEG/PNG up to 1.5–2.7 MB each. |
| 5 | Medium | Accessibility (axe-core 4.10): 21 colour-contrast failures (e.g. teal-600 badges, white text on photos) and 1 heading-order issue. |
| 6 | Medium | `agent.py` sends up to 10 history messages unbounded in length, no rate limit, no request-size limit, CORS `*`. |
| 7 | Medium | Destination data duplicated in three files; values can drift (they already differ in wording). Coordinates are presented as "precise" without a source. |
| 8 | Low | `WhyRaahi` claims "24/7 AI planner" while the AI is not deployed. |
| 9 | Low | `render.yaml` defaults to OpenAI; `backend/.env.example` is fine (no secrets committed — checked). |
| 10 | Low | No `robots.txt`/`sitemap.xml`; one `<title>` for everything. |

Security check: no API keys or secrets found in the current files of the repository or in the built JS bundle (searched for `sk-`, `gsk_`, `AIza`, `key=`). Git history was not scanned: the copy used here held only the latest commit. Run a history scan (for example GitHub secret scanning or `gitleaks`) and rotate any key that was ever committed or shared.

## 6. Plan

1. Make the existing Flask backend run on Vercel (`api/index.py` + `vercel.json`) so production gets the real agent, without breaking the Render path.
2. Replace the prompt-only agent with a tool-calling loop (bounded steps, timeouts, provider fallback) and real tools: destinations, weather (Open-Meteo + PMD official alerts), routes (OSRM + curated legs), road status (honest aggregation), budget, itinerary create/update, save/get trip, booking-enquiry draft.
3. Add storage (Postgres via `DATABASE_URL`, SQLite locally) for destinations, trips and enquiries, with token-protected trips, an admin token, validation and rate limits.
4. One shared destination dataset (`shared/destinations.json`) with sources, precision flags and review dates, used by backend, frontend and the DB seed.
5. Frontend: green/earth theme, real Northern Pakistan hero, `/plan` workspace (chat + structured preferences + editable itinerary + budget + conditions + booking), `/trips`, booking enquiry form, road & weather section, trust section, optimised images, contrast fixes.
6. SEO (pre-rendered destination pages, sitemap, robots), tests (backend unit + 10 agent scenarios, E2E at three viewports), docs.
