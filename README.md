# Raahi: AI trip planner for Northern Pakistan

Raahi plans trips to Hunza, Attabad Lake, Passu, Khunjerab Pass, Skardu, Deosai, Fairy
Meadows and the K2 trek. Tell it where, when, who and roughly how much, by chat or with a
form, and it builds a day-by-day plan around the real road: drive days, departure times set
by daylight, overnight stops, season checks, a live forecast, honest road information and a
line-by-line cost estimate. You can change the plan by chat or by hand, save it, and send a
booking enquiry.

Behind the planner, a team of specialist agents (itinerary, weather, route, budget, stays,
safety, packing, emissions, validation) works on each trip in parallel, and you can watch
them do it. The **Travel Twin** tests a trip against what-ifs ("What if the Khunjerab route
becomes unavailable on day 4?") on a copy and compares the two before you accept anything.
The **Journey Guardian** re-checks a trip and scores each day's risk from documented factors.

Raahi is careful about what it knows. Forecasts come from a live weather model with the time
they were checked. Road status is never guessed: it says "Current road status could not be
verified" and points to the official sources. Prices are estimates, not quotes. Nothing is
ever booked or paid through Raahi.

How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The state of the project
before this version: [docs/AUDIT.md](docs/AUDIT.md).

## Features

| Feature | Notes |
|---|---|
| AI travel agent (chat) | Calls 12 server-side tools (destinations, weather, routes, road status, budget, places to stay and eat, create and update itinerary, save and reopen trips, booking enquiry draft) with step, tool-call, time and size limits. Works with any OpenAI-compatible model, with a backup provider. |
| Guided mode | Without an AI key, or if the model fails, a rule-based assistant answers with the same tools and says that it is in guided mode. |
| Trip memory | A structured trip state (places, origin, dates, days, adults, children, budget and whether it is per person, transport, stays, pace, interests, accessibility, food, guide) kept across messages; nothing is asked twice. |
| Trip form | The same details as a form, with validation. |
| Day-by-day plan | Route order, travel days, departure and arrival times, overnight stops, activities, risks and sources for each day, and a bad-weather alternative for sightseeing days. Warns when the days are too few, places are out of season, a drive may end after dark, or a route suits limited mobility poorly. |
| Editing | By chat ("one day less", "add Deosai", "start on 12 May", "cheaper") or by hand: edit, regenerate or reset any day. Every other preference is kept. |
| Budget | Itemised PKR estimate (transport, stays, food, entry fees, guide, activities, 10% contingency) for the group and per person, compared with your budget, with ways to save. |
| Weather and roads | Open-Meteo forecast per day with confidence, official PMD alerts, typical seasonal closures, and official places to check road status (NHMP helpline 130). |
| Stays | For each overnight town: Raahi's curated places with indicative prices per room-night, matched to your own per-night range (or to what your budget allows), plus real hotels, guest houses and hostels from OpenStreetMap with map, website and phone links. OpenStreetMap has no prices, so those are grouped only by the price level their type usually has. Ask in chat too: "Hunza mein 5000 se 8000 tak hotel". |
| Food | Local dishes worth trying in each area, and restaurants and cafés from OpenStreetMap near each stop. |
| Saved trips | Saved in the database with a private key kept in your browser; reopen, update or delete from "My trips". |
| Booking enquiries | Consent required, a reference like `RAH-7KQ2-M9XD`, status check and withdrawal; an admin page to review them. It is an enquiry, not a booking. |
| Destination pages | One page per place with season, access, altitude, stays, forecast and sources, prerendered for search engines, plus `sitemap.xml` and `robots.txt`. |
| Multi-agent planning | A Master Orchestrator picks the agents a request needs (a packing question doesn't run the budget agent), runs independent agents in parallel, has a Validation agent cross-check them, retries a failed weather lookup once, and asks you when a choice is yours (over budget, too few days). Works without an AI key; with one, the model only rewords the validated answer. |
| Agent Control Center (`/agents`) | The workflow graph, each task's inputs, outputs, tool calls, timings, retries and errors, a timeline and the event log, all from real server events. The last 10 runs are kept in your browser. |
| Travel Twin (`/twin`) | A copy of your trip, a 3D-style route view coloured by risk, and what-ifs: a road closed from a given day, heavy snow, budget up or down, days added or removed, a place inaccessible, more people, more adventure. Typed in English or Roman Urdu. Shows days, cost, hours, route, risk and emissions side by side with a recommendation; your plan changes only if you press Accept. |
| Journey Guardian (`/guardian`) | Re-runs the weather, route and safety agents on a saved trip, your current plan or the Twin, scores each day 0–100 with the evidence for every point, and lists what changed since your last check. Re-checks every 30 minutes while the page is open and can notify you in the browser. |
| Packing list | A Packing tab in the planner: items from your places, season, forecast and activities, each with its reason, ticks kept in your browser. |
| Emissions | Transport CO2e for the plan and for coach, car and flight options, as a range with its assumptions and source. |
| Light and dark theme | Follows your device, or choose light or dark. |

### What is live and what is not

| Information | Where it comes from | Live? |
|---|---|---|
| Weather forecast | [Open-Meteo](https://open-meteo.com) forecast model, up to 16 days | Yes, with the time it was checked |
| Weather warnings | Pakistan Meteorological Department public alert feed (CAP) | Yes |
| Drive time (second opinion) | OSRM routing on OpenStreetMap data | Yes, but free-flow: no closures or slowdowns |
| Drive times in the plan | Raahi's curated road legs | No, reviewed estimates |
| Road status | No public live source exists for Gilgit-Baltistan | No. Always "could not be verified", with official places to check |
| Costs and stays | Raahi's cost assumptions (reviewed 27 Oct 2026) | No, estimates |
| Places to stay and eat | OpenStreetMap contributors, through the Overpass API | Yes, but no prices or opening status |
| Possible closures in the news | Tavily search, only if you add a key | Unverified reports |
| Risk score (Twin, Guardian) | Raahi's weighted factors from the forecast, PMD alerts, seasons, drive length, daylight and altitude | Partly: live where the forecast and alerts are. A heuristic, not an official safety assessment |
| Emissions | UK Government (DESNZ) 2025 conversion factors, with Raahi's mountain-road assumptions | No, estimates as ranges |
| What-if scenarios | Your own assumptions | No, never presented as forecasts |

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer and [Python](https://www.python.org) 3.12
or newer. No API key is needed to start.

**Windows (PowerShell in VS Code)**

```powershell
git clone https://github.com/Qamar7071/Agent.git
cd Agent
npm install
npm run build

cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# If PowerShell blocks that, run once: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
copy .env.example .env
python app.py
```

**macOS or Linux**

```bash
git clone https://github.com/Qamar7071/Agent.git && cd Agent
npm install && npm run build
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Open http://localhost:5000. The website and the API run together, and saved trips go into
`backend/raahi.db` (SQLite).

To work on the front end with instant reload, keep `python app.py` running and, in a second
terminal in the project folder, run `npm run dev`, then open http://localhost:5173 (it
forwards `/api` to port 5000).

### Settings

The backend reads `backend/.env` locally; on Vercel or Render you add the same names in the
dashboard. Every setting is explained in [backend/.env.example](backend/.env.example). The
important ones:

| Name | Needed for | Example |
|---|---|---|
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | The AI agent (without them: guided mode) | a key from OpenAI, Groq or Google AI Studio |
| `LLM2_API_KEY`, `LLM2_BASE_URL`, `LLM2_MODEL` | A backup AI provider (optional) | Gemini through its OpenAI-compatible endpoint |
| `DATABASE_URL` | Saving trips and enquiries online | `postgresql://USER:PASSWORD@HOST/DB?sslmode=require` |
| `ADMIN_TOKEN` | The admin page; enquiries stay off without it | a long random string |
| `SITE_URL` | Canonical links and the sitemap | `https://your-domain.example` |
| `TAVILY_API_KEY` | Road news search (optional) | |
| `AGENT_RATE_PER_MIN` | Agent runs, simulations and Guardian checks per visitor per minute (default 20) | `20` |

Keys only ever go in the backend. Anything starting with `VITE_` ends up in the website's
JavaScript, so never put a key there ([.env.example](.env.example)).

To get an AI key: OpenAI at https://platform.openai.com/api-keys, Groq at
https://console.groq.com/keys, or Google AI Studio at https://aistudio.google.com/apikey.
Put it in `LLM_API_KEY` with the matching `LLM_BASE_URL` and `LLM_MODEL` from
`backend/.env.example` (model names change over time; check the provider's model list),
then restart `python app.py`. http://localhost:5000/api/health
shows `"configured": true` under `ai` when the key is loaded.

## Deploy on Vercel

The site is static (`dist/`, served by Vercel's CDN) and the API is one Python function
(`api/index.py`, which loads `backend/app.py`). `vercel.json` already configures both.

1. **Database.** In the Vercel project, open Storage (or the Marketplace), add a Postgres
   database such as Neon, and connect it to the project. Make sure an environment variable
   named `DATABASE_URL` holds its connection string (add it yourself if the integration
   uses another name). Without it, saving and enquiries are switched off and the site says so.
2. **Settings.** Under Settings → Environment Variables add `ADMIN_TOKEN`, your AI key
   (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`), and `SITE_URL` if you use your own domain.
   Each variable applies to the environments you tick: tick Preview as well as Production
   if you want branch previews to have the AI and saving.
3. **Deploy.** Push to the branch Vercel deploys (usually `main`), or click Redeploy.
4. **Check.** Open `https://<your-site>/api/health`. You want `"configured": true` under
   `ai`, `"enabled": true` under `storage` and `"enquiries_open": true`. The tables are
   created on first use. To create them in advance, run
   `python backend/storage.py init` on your computer with `DATABASE_URL` set to the same
   database.
5. **Test the live site** (optional): `python e2e/run_e2e.py https://<your-site>`.

On 28 Oct 2026 Vercel built a preview of the `raahi-upgrade` branch without errors. Previews
sit behind Vercel's login, so its pages and `/api/health` could not be opened from here: open
the preview while logged in to Vercel and do step 4 there, then merge the branch into `main`
to publish it.

[render.yaml](render.yaml) describes an alternative deployment on Render (one Flask service
with gunicorn). It was not tested in this upgrade.

## Tests

| Command | What it runs | Result on 28 Oct 2026 |
|---|---|---|
| `npm run build` | Production build, static destination pages, sitemap | OK on 30 Oct: main script 235 KB (74 KB gzipped), planner 67 KB (19 KB), Travel Twin 24 KB (8 KB), Agent Control Center 13 KB, Guardian 12 KB |
| `npm run test:api` (venv active; once, in `backend/`: `pip install -r requirements-dev.txt`) | 147 backend tests, all offline: data, planner, budget, live-service parsing with recorded responses, places, storage, API, parser, agent with a scripted model (including the 10 evaluation scenarios), and the multi-agent system: task graph and events, intent routing, a failing agent, validation retries, unsupported claims, every scenario type, Khunjerab day 4, risk, eco, packing, Guardian, streaming | 147 passed (30 Oct) |
| same, with `RAAHI_TEST_PG_URL=postgresql://…` | The storage tests also on Postgres 16 | passed (run before the stays and food update; storage code unchanged since) |
| `npm run test:e2e` (server running; `pip install -r e2e/requirements.txt` and `python -m playwright install chromium` first) | 21 checks in a real browser: pages, navigation, form, chat, editing, tabs, packing, saving, enquiry, admin, network errors, Travel Twin (demo, Khunjerab what-if, accept), Agent Control Center, Guardian, theme, phone to desktop layouts, keyboard | 21 passed (30 Oct) |
| `npm run audit:a11y` (server running) | axe-core accessibility rules (WCAG 2.2 A and AA plus best practices) on 62 page states at phone and desktop sizes, including the agent pages and the dark theme, and page weight | 0 violations (30 Oct) |

The browser checks ran against a local server in guided mode with SQLite. During the 30 Oct
runs, most Open-Meteo requests from the test machine failed (rate-limited or timed out) and
OpenStreetMap's Overpass servers could not be reached, so those paths were tested in their
"unavailable" state; the tests accept either a live result or the honest failure message. A
first visit to the home page downloaded about 830 KB on a desktop before scrolling and about
955 KB after scrolling to the bottom, against 8.5 MB for the old site. The local server sends
text uncompressed; with compression, as on Vercel, the first load is about 630 KB.

What the tests do not show: how a real AI model behaves (the agent was tested with a
scripted model, because no AI key was available for testing), that this version works on
Vercel (the preview built, but could not be opened from here), or that the live services
will keep answering. Automated
accessibility rules also catch only part of the problems; try the site with a keyboard and a
screen reader too.

## Project structure

```
api/index.py          Vercel entry point for the API
backend/              Flask API, chat agent, planner, budget, storage, live services, tests
backend/agents/       multi-agent system: orchestrator and the specialist agents
backend/twin/         Travel Twin: scenario parser, simulation, comparison
backend/guardian.py   Journey Guardian checks
shared/               destinations.json: the one dataset used by the API and the website
src/                  React website (pages, components, planner state, router, API client)
public/               favicon and the optimised photos (WebP and social images)
photos/originals/     source photos; `npm run images` rebuilds public/images from them
scripts/              image pipeline, prerendering, one-off data migration
e2e/                  browser tests and the accessibility audit
docs/                 architecture and the pre-upgrade audit
```

To change destination facts, road legs, stays or cost assumptions, edit
`shared/destinations.json` (and its `last_reviewed` date), then run `npm run test:api`.

## Limitations

- **Road status is not live.** No public API publishes road conditions for Gilgit-Baltistan.
  Raahi shows official weather alerts, typical seasonal closures and where to check (NHMP
  helpline 130), and never calls a road open.
- **Prices are estimates**, from cost assumptions reviewed on 27 Oct 2026. There is no hotel,
  flight or transport booking API, so no live rates or availability.
- **Enquiries are not bookings.** They go to an admin queue at `/admin`; there is no operator
  integration and no email notification yet, so someone has to check the queue.
- **No accounts.** Saved trips and enquiries are reachable only from the browser that holds
  their private keys. Clearing the browser's data loses access.
- **Rate limits are per server instance** and kept in memory, so on Vercel they are
  approximate.
- **The AI mode was tried with a real model only briefly** (gpt-oss-120b on Groq, 30 Oct 2026,
  five prompts). That test found answers from memory and invented hotel amenities, which led
  to the server-side pre-fetch and the claim check; test again after any model change.
- **Groq's free tier allows about 8,000 tokens a minute** for gpt-oss-120b, per account. One
  chat question uses about 4,000–9,000 tokens, so two visitors at once can push the AI into
  guided mode for a minute. Groq's paid Developer plan raises the limit.
- **Free services have conditions.** Open-Meteo's free API is for non-commercial use only
  (under 10,000 calls a day), and the public OSRM server is best-effort with no guarantee.
  A commercial launch needs Open-Meteo's paid API and a self-hosted router.
- **Photo licences are unknown.** The bundled photos came with the original project; credits
  are taken from the files where recorded, but no licences are known. Replace them with
  photos you own or have permission to use before any public or commercial use.
- **Forecast points are approximate.** Each place uses one approximate coordinate, and
  mountain weather changes quickly with altitude.
- **The risk score is a heuristic.** It adds documented factors from public data; it is not
  an official safety assessment, cannot see live road conditions, and its confidence is never
  above medium.
- **What-ifs are only as good as Raahi's road data.** The Twin re-plans on Raahi's road
  sections and cost assumptions; it does not model traffic, repair times or how long a closure
  lasts.
- **The Guardian only checks while its page is open.** There is no background job or push
  service yet, so it cannot warn you when the site is closed.
- **Not built yet (phase B):** Local Pulse community reports, the offline survival mode, the
  interactive map page, accounts with roles, and the Emergency Assistance agent. The agent
  roster lists them as planned.
- **Emissions are estimates** from UK factors with Raahi's assumptions for mountain roads;
  Pakistan publishes no equivalent set.
- Python 3.12, which Vercel uses, was not tested here (tests ran on Python 3.13).

## Next steps

1. Rotate any AI key that has ever been pasted into a chat, file or screenshot, then add the
   new key only in Vercel's settings.
2. Deploy with `DATABASE_URL`, `ADMIN_TOKEN` and an AI key, check `/api/health`, and run the
   browser tests against the live site.
3. Try the AI mode with your chosen model: read the tool trace in the chat ("What Raahi
   checked") for the 10 scenarios and adjust the prompt if needed.
4. Replace the photos with licensed ones.
5. Email the admin when an enquiry arrives (a transactional email service), and let the
   traveller choose to get a copy.
6. Move rate limiting to a shared store (such as Upstash Redis) or the Vercel firewall.
7. Add database migrations (Alembic) before the next schema change.
8. Only with a licensed operator's real API: live availability and booking, showing
   "confirmed" only when the operator confirms.
9. Phase B of the agent platform: accounts with roles, Local Pulse reports with moderation
   (feeding the risk score's community factor), offline mode, the map page and the Emergency
   Assistance agent.
