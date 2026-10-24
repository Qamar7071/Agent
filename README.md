# Raahi — AI Travel Concierge for Northern Pakistan

React 18 + Vite + Tailwind CSS frontend for an AI travel agent focused on Gilgit-Baltistan.

## Run it online (frontend + AI backend)

The agent's brain lives in `backend/` (Flask). It serves the API **and** the built site, so you deploy one app.

```bash
# 1. Build the frontend
npm install && npm run build

# 2. Start the backend (serves API + the built site)
cd backend
pip install -r requirements.txt
cp .env.example .env         # paste your LLM_API_KEY (OpenAI / OpenRouter / Groq …)
python app.py                # → http://localhost:5000
```

Open `http://localhost:5000` — the site and the live agent run together.

**Deploy online (free):** push to GitHub → on [Render](https://render.com) choose *New → Blueprint* (it reads `render.yaml`) → add `LLM_API_KEY` in the dashboard. Done. Works the same on Railway/Fly with the included `Procfile`.

**Without an API key** the chat still gives a guided reply (it asks you the right questions) and the planner works fully — add the key to unlock the thinking, adaptive agent.

Photos are bundled in `src/assets/destinations/` so they always show; drop your own files with the same names to replace them.

## Real data, no API keys needed

These work out of the box in the browser — nothing to configure:

- **Live weather** — real current conditions + 7-day forecast from [Open-Meteo](https://open-meteo.com) (free, keyless), shown in each destination, in the planner's stays, and in the assistant's "road & weather" action. Code: `src/lib/weather.js`.
- **Exact distance & time** — every travel leg links to **Google Maps directions** (`src/data/logistics.js` → `mapsDirections`), which computes the exact distance, drive time and live traffic for you. The curated km/hours shown inline are accurate *approximate* road figures; Google gives the live number.
- **Maps** — each destination dialog embeds a Google map (keyless `output=embed`).
- **Transparent budget** — the planner computes an itemised PKR estimate (transport, stays, food, park fees) from the assumptions in `src/data/logistics.js` (`costModel`). It is clearly labelled an estimate; it never invents live prices.
- **Stays** — real, well-known properties per town with **indicative** price ranges and a "check live prices" link. Not live quotes — confirm when booking.

### Offline agent (works with NO backend)

When no AI backend is connected, Raahi still behaves like an agent: ask it to plan a
trip and it runs a **flipped-interaction** flow — it asks you, one question at a time
(destinations → start city → days → travellers → budget → month → style), with quick
replies, remembers your answers, **adapts** (e.g. in January it warns that Deosai/Khunjerab
are snowed-in and leans to reachable towns), then auto-builds the day-by-day plan. Code:
`src/lib/planFlow.js`. Connect your LLM and the real agent takes over (see the system
prompt note at the end of this file).

### Real photos are bundled

`src/assets/destinations/` now ships with a real photo per destination (plus `hero.jpg`
and `cta.jpg`), so images always show without any network. Replace any file with your own
(same name) to use your photography — it takes priority automatically.

### What still needs YOUR backend / API keys

- **Live hotel availability & exact fees**, and **live road/KKH status** — there is no free, reliable public API for these in GB. The UI links to official sources (PMD, NDMA, NHA) and booking search. To make these live, add them to your AI backend (e.g. Google Places / a booking API) and return the data from `/api/plan`; the UI already renders `cost`, `stay` and per-day fields when present.
- **The "thinking" agent** — reasoning and recommendations come from your AI backend via `/api/chat`. The frontend formats its replies (text, destination cards, itineraries, actions). When the backend is offline, a rule-based guide answers from the curated data instead.


## Quick start

```bash
npm install
cp .env.example .env        # point VITE_BACKEND_URL at your AI backend
npm run dev                 # http://localhost:5173
npm run build               # production build in dist/
```

## Plugging into your existing project

**Merging into your own React app:** copy `src/` over (or just `components/`, `context/`, `data/`, `lib/`), then merge `tailwind.config.js`. Also copy the font `<link>` from `index.html`.

**Using your own photos (recommended):** put them in `src/assets/destinations/`, named by destination id. They are picked up at build time and take priority over the remote photos.

| File name | Used for |
|---|---|
| `hero.jpg` | Hero background |
| `cta.jpg` | Final call-to-action band |
| `hunza.jpg`, `skardu.jpg`, `attabad.jpg`, `fairy-meadows.jpg`, `deosai.jpg`, `passu.jpg`, `khunjerab.jpg`, `k2.jpg` | Destination cards, dialogs, planner, seasons |

`.jpg`, `.jpeg`, `.png`, `.webp` and `.avif` all work. When there is no local file, the site loads real photographs from Wikimedia Commons, listed in `src/data/destinations.js` under `photos`. If none of them load, a mountain illustration is shown, so there are never broken images. Photo credits are listed in the footer.

## Backend integration (`src/lib/api.js`)

During development, Vite forwards `/api/*` to `VITE_BACKEND_URL`. The default is a Flask server on port 5000. You can change the endpoint paths in `.env`.

### `POST /api/chat`

Request:

```json
{ "message": "Plan 5 days in Hunza", "history": [{ "role": "user", "content": "..." }] }
```

The response can be plain text or structured. All of these work:

```json
{ "reply": "Markdown text…" }
{ "response": "…" }
{ "answer": "…" }
{
  "reply": "…",
  "destinations": ["hunza", "Attabad Lake"],
  "itinerary": { "title": "…", "days": [{ "day": 1, "title": "…", "location": "Hunza", "activities": ["…"], "estimated_cost": 12000 }] },
  "actions": [{ "label": "Open trip planner", "type": "planner", "value": { "destinations": ["hunza"] } }],
  "links": [{ "label": "…", "href": "https://…" }]
}
```

If the backend returns the JSON as a string inside `reply`, it is parsed. Destinations are rendered as cards and itineraries as a day list with an **Open full plan** button.

### `POST /api/plan`

Request:

```json
{ "from": "Islamabad", "destinations": ["hunza","attabad"], "start_date": "2026-11-06",
  "days": 7, "travelers": 2, "budget_pkr": 150000, "interests": ["lakes"], "transport": "car" }
```

Response: `{ "itinerary": { "title", "summary", "total_cost", "warnings", "days": [{ "day", "date", "title", "location", "activities", "notes", "transport", "accommodation", "estimated_cost" }] } }`. The fields are flexible; see `normalisePlan`.

Costs, stays and totals are shown **only** when the backend sends them.

### When the backend is not running

- **Chat:** answers come from the curated destination guide (`src/lib/offlineGuide.js`), labelled as **Offline guide**, with a **Retry AI** button.
- **Planner:** builds a draft route along the real road network (`src/lib/offlinePlanner.js`), labelled as **Offline draft**.
- **Live data:** neither path makes up live weather, road status, prices or bookings. Instead, they link to PMD, NDMA, NHA and the GB Tourism Department.

## Security

Never put API keys in `VITE_*` variables, because they ship to the browser. Keep keys in the backend's own `.env`.

## Structure

```
src/
  components/
    hero/          Hero, SearchBar
    assistant/     AssistantPanel, AssistantSheet, RichBlocks, MiniMarkdown
    destinations/  Destinations (editorial grid), DestinationDialog
    planner/       TripPlanner, PlannerForm, ItineraryView
    sections/      Experiences, Seasons, Safety, FinalCTA, Footer
    ui/            SmartImage, Logo, Reveal, SectionHeading, Contours
  context/AppContext.jsx   shared assistant / planner / dialog state
  data/                    destinations + content (edit facts here)
  lib/                     api, offline guide & planner, images, format
```
