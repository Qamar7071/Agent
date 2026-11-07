# Raahi: AI trip planner for Northern Pakistan

Raahi plans trips to Hunza, Attabad Lake, Passu, Khunjerab Pass, Skardu, Deosai, Fairy
Meadows and the K2 trek. Tell it where, when, who and roughly how much, by chat (in English or
Roman Urdu) or with a form, and it builds a day-by-day plan around the real road: drive days, departure times set
by daylight, overnight stops, season checks, a live forecast, honest road information and a
line-by-line cost estimate. You can change the plan by chat or by hand, save it, and send a
booking enquiry.

Behind the planner, a team of specialist agents (itinerary, weather, route, budget, stays,
safety, packing, emissions, validation) works on each trip in parallel, and you can watch
them do it. The **Travel Twin** tests a trip against what-ifs ("What if the Khunjerab route
becomes unavailable on day 4?") on a copy and compares the two before you accept anything.
The **Journey Guardian** re-checks a trip and scores each day's risk from documented factors.

Before the trip, the **Group Room** lets a group agree on one plan: friends join from a link
with just a name, everyone answers a one-minute profile, private comfort needs (altitude,
motion sickness, walking, food) are shared without names, the agents propose two or three
options with a Group match score and what each one gives up, members vote and the organizer
confirms. **How the agents decided** shows every run as a readable group chat of the agents:
each proposal, concern and decision, with its reason and evidence, linked to its step in the
Agent Control Center.

Not sure where to go? **Where can we go?** takes a budget, days, group and month and plans
every trip Raahi knows for them, the cheapest comfortable way, showing which ones fit. Every
plan has a **map** with each day in its own colour and Google Maps directions per day, and a
**Share with family** link that shows people at home which town you sleep in each night and
who to call if they can't reach you. Places can be saved with a heart and turned into a trip,
and the chat takes speech as well as typing.

During the trip, **Safar Saathi** (trip companion) keeps the group's spending: add an expense
in three taps, see whether you are on pace with the plan, get a friendly early warning with
costed choices, and settle up with the fewest payments. It works offline and in Roman Urdu.

### 60-second demo (for judges, two phones)

The Group Room needs the database (`DATABASE_URL`) on the server.

1. **0–10 s. Organizer.** **Plan a trip**, **Trip details**: tick Hunza Valley and Khunjerab
   Pass, 7 days, **Build my plan**. Tap **Plan with your group**, choose **Friends**, type
   your name, **Create the group**. Share the link (or read out the 8-letter code).
2. **10–25 s. Second phone.** Open the link, type a name, **Join**: under 30 seconds, no
   sign-up. Tap **Lakes**, open **Comfort and health (private)**, tick **Altitude makes me
   unwell**, **Save my answers**. The room now says "1 member: avoid going above 4,000 m
   without an acclimatisation day", with no name, and "Not medical advice".
3. **25–40 s. Organizer.** **Ask the agents for options**. Two or three options appear, each
   with a Group match out of 100, cost per person, highest point and what it gives up. The
   private need visibly changed them: an option that keeps Khunjerab says it "comes after 1
   full day at altitude", another skips it, and the reason is shown.
4. **40–50 s.** Tap **See how the agents decided**: the agents' conversation, from Group
   Memory to Consensus, each message linked to its real step. (Without a network, open
   `/decided?run=recorded`: a real run, played back and labelled "Recorded run · not live".)
5. **50–60 s.** The member votes, the organizer taps **Confirm this plan**, then **Start trip
   together**: Safar Saathi opens with both names filled in, and an expense added on one phone
   appears on the other.

### Safar Saathi demo (one phone)

1. **0–10 s.** Open the site, tap **Plan a trip**, open **Trip details**, tick Skardu, 7 days,
   5 adults, budget Rs 1,50,000, **Build my plan**. The day-by-day plan appears.
2. **10–20 s.** Tap **Start trip**. Everything is pre-filled (the first day is today); type
   your name, choose **Roman Urdu**, **Safar shuru karein**. You are on Day 1.
3. **20–30 s.** Tap **+ Kharcha**, type 6000, tap **Khana**, **Save**: three taps. The pace
   bar moves, and a toast offers Undo.
4. **30–45 s.** Add 90000 under **Rehaish**. Raahi first asks "Raqam sahi hai?" (it might be a
   typo). Tap **Haan, sahi hai**: now the nudge says how far ahead of the plan you are and
   offers choices for tomorrow, each with an estimated saving and its source. Pick one: the
   plan and the pace change from tomorrow only.
5. **45–60 s.** Open **Kharcha**: categories against the plan and **Hisaab**, who pays whom
   in the fewest payments, ready to share. Switch the phone to airplane mode and add one
   more expense: it is kept on the phone and syncs when the signal is back.

Raahi is careful about what it knows. Forecasts come from a live weather model with the time
they were checked. Road status is never guessed: it says "Current road status could not be
verified" and points to the official sources. Prices are estimates, not quotes. Nothing is
ever booked or paid through Raahi.

How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The state of the project
before this version: [docs/AUDIT.md](docs/AUDIT.md).

## Features

| Feature | Notes |
|---|---|
| AI travel agent (chat) | Calls 13 server-side tools (destinations, weather, routes, road status, budget, fit a plan to a new budget, places to stay and eat, create and update itinerary, save and reopen trips, booking enquiry draft) with step, tool-call, time and size limits. Works with any OpenAI-compatible model, with a backup provider. Replies can be copied, and suggested follow-ups are one tap. |
| Roman Urdu chat | Write in Roman Urdu ("5 din Skardu jana hai, 4 log hain, budget 1 lakh hai.") and the answer comes back in Roman Urdu; English stays English. "Budget 20,000 kam kar do, itinerary change na ho zyada." re-prices the plan with cheaper stays, then cheaper transport, keeps the days and places, says what changed and offers the other option; your stated budget is not changed. "Deosai jana safe rahega is month?" answers with the usual season, altitude, the forecast if live, and "Current road status could not be verified" with official places to check. "Hunza mein family ke saath best places suggest karo." suggests places with reasons. |
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
| Safar Saathi (`/trip/…`) | Start a saved or current plan as a trip: Today (budget pace against the plan, nudges with choices, tomorrow's Guardian risk with a Plan B, today's plan, end-of-day summary and tip), Spending (categories against the plan, every expense, settle up with the fewest payments, share), Plan. Expenses in 3 taps with a big number pad and one-tap amounts; a pill shows whether everything is synced; a plain warning says when spending is ahead of the plan and by how much; settle-up can go to WhatsApp as text (nothing is sent automatically); works offline and syncs later without duplicates; English and Roman Urdu. Nudge rules R1–R4 are plain tested code; an AI may only reword them, keeping every number. |
| Group Room (`/g/…`) | Create a group from a saved plan; anyone with the link or 8-letter code joins with a name. Trip type (friends, family, couple, solo) sets the defaults; a one-minute profile with chips only (interests, budget comfort, pace, must-dos, no-gos). Private needs are stored without a link to the member (a one-way hash of the group and the member's key) and shown only as counts, unless that member opts in to their name; "Not medical advice" is always shown. The agents build two or three options with the real planner (an altitude need adds a full day at altitude before going above 4,000 m, or a gentler option skips it), score each for every member (Group match) and list what each gives up. Members vote; only the organizer confirms; then everyone starts Safar Saathi together with shared expenses. The room shows who has answered, each option's share of the votes, and a WhatsApp invite link. |
| How the agents decided (`/decided`) | Every run as a group chat of the agents: proposals, concerns and decisions written from each agent's own result, with reasons, evidence, the earlier message each one answers, and a link to its step in the Agent Control Center. Live runs stream as they happen. If a live run fails or takes more than 25 seconds, a recorded real run plays instead, labelled "Recorded run · not live". Shown for the planner, Travel Twin, Guardian, Group Room options and each Safar Saathi trip. **Decisions at a glance** sums up each decision as a card: what was at stake, what was recommended and by which agent, what else was weighed, and whether the choice is yours. |
| When to go | In the plan's Weather and roads tab: the months that suit every place in the plan, months when a seasonal road is usually closed, and what that means for your month, from the guide's typical seasons (not a forecast). |
| Print or PDF | The plan prints cleanly; choose "Save as PDF" in the print window. |
| Where can we go? (`/explore`) | Budget, days, adults, starting city, month, interests and style in; up to 12 trip ideas out, from one place to combined routes. Each is a real plan from the server's planner, built the most comfortable way that fits the budget (hired car, then budget stays, then coaches, then flights only when the road can't fit the days). Ranked by budget, days, season, interests and style, with plain reasons for and against each ("About Rs 24,900 over your budget, even the cheapest way (estimate)", "Access to Khunjerab Pass is usually closed by snow then"). One tap opens that exact plan. |
| Trip map | A Map tab in every plan (Leaflet with OpenStreetMap tiles, loaded only when opened): each day's moves in its own colour, pins with the nights spent there, a day list that zooms the map, and Google Maps directions for each day. Lines are straight between approximate points and the map says so. |
| Share with family (`/s/…`) | A read-only link for people at home: the town for each night with dates (tonight first once the trip has started), an optional note the traveller writes, what a gap in contact usually means, and tap-to-call 1122, 15 and 130; English or Roman Urdu. It shows the plan, not a location: no tracking, no costs, no names. Only a hash of the link's key is stored; a new link replaces the old one, and "Stop sharing" ends it at once. Needs a saved trip. |
| Saved places | A heart on every destination; saved places stay in this browser, show on the home page and open the trip form with those places ticked. |
| Speak instead of typing | A microphone button in the chat where the browser supports speech recognition (English, or Urdu when the site is set to Roman Urdu). The words go into the box to check before sending. In Chrome the audio goes to Google's speech service, and the button says so. |
| Destination pages | One guide page per place: photos, overview, things to see, best months, an estimated budget, weather (live forecast or, when there is none, what usually happens that month, labelled as typical), altitude, things to consider, road uncertainty, how many days, what to pack and sources. Prerendered for search engines, plus `sitemap.xml` and `robots.txt`. The home page's **Explore Northern Pakistan** guide has search, kind-of-place filters, travel-month chips and sorting. |
| Works offline | After one visit, pages you have opened load again without a connection (service worker); Safar Saathi works fully offline and syncs later. |
| Multi-agent planning | A Master Orchestrator picks the agents a request needs (a packing question doesn't run the budget agent), runs independent agents in parallel, has a Validation agent cross-check them, retries a failed weather lookup once, and asks you when a choice is yours (over budget, too few days). Works without an AI key; with one, the model only rewords the validated answer. |
| Agent Control Center (`/agents`) | The 12 agents (Master Orchestrator and 11 specialists) with what each did in the run, a Stages view (what ran in parallel, in order) and the workflow graph, the Validation agent's checks, each task's inputs, outputs, tool calls, timings, retries and errors, a timeline and the event log, all from real server events. The last 10 runs are kept in your browser. |
| Travel Twin (`/twin`) | A copy of your trip, a 3D-style route view coloured by risk, and what-ifs: a road closed from a given day, heavy snow, budget up or down, days added or removed, a place inaccessible, more people, more adventure. Typed in English or Roman Urdu. Shows days, cost, hours, route, risk and emissions side by side with a recommendation, plus advantages and disadvantages, each read from one number in the comparison; your plan changes only if you press Accept. |
| Journey Guardian (`/guardian`) | Re-runs the weather, route and safety agents on a saved trip, your current plan or the Twin, scores each day 0–100 with the evidence for every point, and lists what changed since your last check. Re-checks every 30 minutes while the page is open and can notify you in the browser. Shows what drives the risk by kind (weather, season, altitude, road uncertainty, travel timing) and the official places to check, and always says the score is an informational estimate, not an official safety assessment. |
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
| `COMPANION_RATE_PER_MIN` | Safar Saathi settings, expense syncs and nudge wording per visitor per minute (default 40) | `40` |
| `SLOW_REQUEST_MS` | API requests slower than this are logged as warnings (default 3000) | `3000` |

Every API response carries an `X-Request-ID` header. The same id is in the server log line and
in the "Something went wrong" message (as "Reference: …"), so a problem someone reports can be
found in the logs.

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

| Command | What it runs | Result |
|---|---|---|
| `npm run build` | Production build, static destination pages, sitemap, service worker | OK on 7 Nov: main script 235 KB (76 KB gzipped), icons in one shared file 54 KB (12 KB), planner 78 KB (22 KB), Safar Saathi 47 KB (15 KB), Group Room 36 KB (11 KB), Travel Twin 28 KB (9 KB), Agent Control Center 20 KB (7 KB), destination page 19 KB (6 KB), Where can we go 12 KB, How the agents decided 12 KB, the map 7 KB plus Leaflet 150 KB (44 KB) loaded only when the Map tab opens, the family page 7 KB |
| `npm run test:unit` | 58 tests with Node's built-in runner, no extra packages: Safar Saathi's logic (money format, trip days, pace and prepaid money, nudge rules R1–R4, the typo check first, split rounding over 200 random cases, fewest payments, sync merge, a warning that points at cheaper choices only when one is on screen); the conversation (every message of the recorded run belongs to a real step and appears in its event log, replies, timing, playback, decision cards); the best month advisor and the trip map (segments, nights per stop, directions) with the real guide data; the Control Center's stages (a Validation retry shown after Validation); destination search and filters; destination facts (journey time, typical days); the copied itinerary text with estimates and the road caveat; Travel Twin advantages and disadvantages from a real comparison; Guardian risk by kind | 58 passed (7 Nov) |
| `npm run test:api` (venv active; once, in `backend/`: `pip install -r requirements-dev.txt`) | 211 backend tests, all offline: data, planner (including the acclimatisation rule), budget, live-service parsing with recorded responses, places, storage, API, parser, agent with a scripted model (including the 10 evaluation scenarios), the multi-agent system (task graph and events, intent routing, a failing agent, validation retries, unsupported claims, every scenario type, Khunjerab day 4, risk, eco, packing, Guardian, streaming), the agents' messages (each from a real step, failures said out loud, Twin and Guardian explain themselves), Safar Saathi sync, and the Group Room (join, private needs without names, a need that changes the plan, votes, confirm, leaving, removal, member access to the shared trip), Where can we go (each idea is the planner's own plan, the most comfortable way that fits, ranking, winter closures, days needed), Share with family (towns and dates only, replace, stop, refuse bad keys, dates from the started trip, deleted with the trip), Roman Urdu chat (language detection with mixed English, the four example messages, budget changes that keep the days and places, "is it safe this month" answers that never call a road open), CORS for the private-key headers, request ids, ETags, a crash answered with a reference and no internals, the bounded cache, an offline batch of 60 expenses synced in a fixed number of queries, and a wrong admin key in any alphabet (401, not 500) | 211 passed (7 Nov) |
| same, with `RAAHI_TEST_PG_URL=postgresql://…` | The storage tests also on Postgres 16 | passed before the Group Room; the new group tables were tested on SQLite only |
| `npm run test:e2e` (server running; `pip install -r e2e/requirements.txt` and `python -m playwright install chromium` first; start the server with `WRITE_RATE_PER_MIN=120`, because the suite saves more trips a minute than the default limit of 6 allows) | 36 checks in a real browser: pages, navigation, form, chat, editing, tabs, packing, saving, enquiry, admin, network errors, Travel Twin, Agent Control Center, Safar Saathi (3-tap expense, pace, split, typo check then nudge, offline), Guardian, Group Room on two browsers (join in under 30 s, anonymous need, options changed by it, vote, confirm), How the agents decided (recorded run labelled and linked, live run, failure falls back to the recorded run), When to go, Where can we go (ranked cards, one tap opens the plan, nothing-fits message), the trip map (pins, directions), Share with family on two browsers (note shown, no prices, stop works), saved places, destination search and filters, Roman Urdu chat (plan, budget cut that keeps the days, honest safety answer), a page opened once loading again offline, Travel Twin advantages, Guardian risk by kind, quick amounts and the WhatsApp settle-up link, decision cards, theme, layouts at five widths, keyboard (skip link, arrow keys in every tab bar) | 36 passed (7 Nov) |
| `npm run audit:a11y` (server running) | axe-core accessibility rules (WCAG 2.2 A and AA plus best practices) on 110 page states at phone and desktop sizes, including the agent pages, every Safar Saathi screen, the Group Room, the agents' conversation, Where can we go, the map, sharing and the family page, Roman Urdu and the dark theme, and page weight | 0 violations (7 Nov) |

The browser checks ran against a local server in guided mode with SQLite. For the 7 Nov runs,
live weather, PMD alerts, routing and places were switched off on the test server (the test
machine could not reach those services), so those paths were tested in their "switched off"
state; the tests accept either a live result or the honest message. A first visit to the home
page on a desktop makes 42 requests (17 of them scripts, down from 40 before the icons were
put in one file) and downloads about 1 MB as the local server sends it, about 700 KB with
compression as on Vercel, against 8.5 MB for the old site. On a phone, an overflow sweep of 13
pages at 360, 390, 768, 1024 and 1440 px in both themes found no sideways scrolling.

What the tests do not show: how a real AI model behaves (the agent was tested with a
scripted model, because no AI key was available for testing), that this version works on
Vercel (the live site could not be opened from the test machine), or that the live services
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
backend/companion.py  Safar Saathi nudge wording (optional AI, numbers checked)
backend/money.py      money as text: Rs 1,50,000
backend/group/        Group Room: merging profiles, consensus options and Group match
backend/agents/voices.py  what each agent says in the conversation, from its own result
src/lib/decided.js    the conversation helpers; src/data/demo-run.json is the recorded run
src/lib/bestMonths.js the best month advisor
backend/explore.py    Where can we go: trip ideas built and ranked by the planner
src/lib/tripMap.js    the trip map's data; src/components/planner/TripMap.jsx draws it
src/pages/SharedTrip.jsx  the family page (/s/…)
src/lib/companion/    Safar Saathi logic: pace, nudges, split, local store, sync, words
public/sw.js          service worker for offline use
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
- **Sharing a trip needs the Group Room and the database.** Expenses sync between phones for
  a group's trip; a trip started without saving stays on the phone that started it. Without
  `DATABASE_URL` the Group Room says it isn't available.
- **Group match is Raahi's own score** from everyone's answers (pace, budget, interests,
  must-dos and no-gos, with a penalty for each unmet private need). It is not a prediction of
  how much anyone will enjoy the trip.
- **Private needs are not encrypted.** They are stored without a link to the member and
  shown only as counts, but someone with access to the database can see which needs a group
  has. Members can remove theirs at any time; deleting the trip deletes the group.
- **The agents' messages are in English.** The pages around them switch to Roman Urdu.
- **The recorded run is fixed.** It is a real run recorded on 31 Oct 2026 for the demo
  fallback; it is always labelled and never about your trip. Re-record it with the same
  request after changing the agents.
- **Where can we go knows 12 trip ideas**, from single places to the usual combined routes.
  It doesn't invent new routes, and its costs are the planner's estimates for your group.
- **Map tiles come from OpenStreetMap's public servers**, which allow light use with
  attribution. A busy public site should switch to a tile provider with a plan of its own.
  The map's lines are straight between approximate points, not roads.
- **The family link is not a tracker.** It shows the saved plan, so it is only as current as
  the last saved change; it can't say where anyone actually is.
- **Speech input depends on the browser.** It doesn't show in browsers without speech
  recognition (Firefox, for example). Urdu speech comes back in Urdu script, which the AI mode
  understands but guided mode may not.
- **Saved places stay in one browser**, like the rest of Raahi without accounts.
- **Not built, on purpose:** a local guide directory (no verified source of guides to point
  to), crowd or cancellation predictions for the best month (no data), and Roman Urdu across
  the whole site (Safar Saathi, the Group Room, the agents' conversation pages and the chat
  have it).
- **Roman Urdu in guided mode is rule-based.** It recognises common words and phrasings (din,
  log, lakh, hazar, kam kar do, safe rahega, is month); unusual spellings may get an English
  answer. Sentences about honesty (estimates, unverified roads) can stay in English.
- **Offline covers pages you have opened.** A page never opened before needs a connection
  once.
- **Pace uses the plan's shape.** Expected spending by a day comes from the cost model's day
  costs scaled to your budget. If the group pays differently (say, every hotel in advance),
  mark those as paid before the trip; they are then counted day by day.
- **Saving estimates come from the cost model**, scaled down to the group's budget, not from
  what the group actually pays, and they are labelled that way.
- **Sync conflicts:** if two phones change the same expense, the later change by phone clock
  wins.
- The 7 Nov tests ran on Python 3.12.3, the version family Vercel uses. Postgres was not
  available on the test machine, so the batched expense sync was tested on SQLite only.

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
