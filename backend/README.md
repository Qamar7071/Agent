# Raahi API (Flask)

The API behind the website: the AI agent, the multi-agent system (orchestrator, specialists,
Travel Twin, Journey Guardian), the deterministic planner, live weather and road information,
saved trips and booking enquiries. It also serves the built website (`../dist`)
when run on its own. Setup and deployment are in the [main README](../README.md); the design
is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

```bash
pip install -r requirements.txt          # add requirements-dev.txt for the tests
cp .env.example .env                     # optional: AI key, database, admin token
python app.py                            # http://localhost:5000 (build the website first: npm run build)
python -m pytest -q                      # offline tests
python storage.py init                   # create the tables in DATABASE_URL (they are also created on first use)
python storage.py sql                    # print the Postgres schema
```

| File | What it does |
|---|---|
| `app.py` | Routes, validation, error format, rate limits, CORS, security headers, request logging, serving `../dist` |
| `config.py` | Every setting, from environment variables (see `.env.example`) |
| `schemas.py` | Pydantic models: trip request, plan changes, trip state, chat, saved trips, enquiries |
| `planner.py` | Route, day split, departure times from sunset, feasibility, season and safety checks, changes |
| `budget.py` | Itemised cost estimate, budget comparison, savings |
| `data.py` | Loads `../shared/destinations.json` and resolves place names |
| `clock.py` | Pakistan time (dates and "today" are Pakistani even on UTC servers) |
| `storage.py` | Saved trips and enquiries (Postgres or SQLite) with hashed private keys |
| `security.py` | Client IP, in-memory rate limiter, admin token check |
| `services/` | `weather.py` (Open-Meteo, PMD alerts), `roads.py` (honest road information), `routing.py` (curated legs, OSRM), `places.py` (stays and food from the guide and OpenStreetMap), `conditions.py` (forecast and roads for a plan), `http.py` (timeouts, caching, User-Agent) |
| `agent/` | `runner.py` (tool loop and limits), `tools.py` (the 12 tools), `prompt.py` (instructions and context), `parser.py` (reads messages without AI), `guided.py` (answers without AI), `llm.py` (OpenAI-compatible client with fallback) |
| `agents/` | The multi-agent system: `base.py` (Agent, Blackboard, Tracer with real events), `orchestrator.py` (intent, task plan, parallel runner, retries, decisions, answer), one file per specialist (memory, research, itinerary, weather, route, budget, accommodation, safety, packing, eco, validation), `common.py` |
| `twin/` | Travel Twin: `scenarios.py` (parse English or Roman Urdu, apply to a copy), `segments.py` (road sections), `simulation.py` (run the affected agents), `comparison.py` (original against simulated) |
| `companion.py` | Safar Saathi: optional AI rewording of a nudge, kept only if the numbers survive |
| `money.py` | Money as text, the Pakistani way: `Rs 1,50,000` |
| `guardian.py` | Journey Guardian: re-run weather, route and safety and list what changed since the last check |
| `tests/` | pytest suite with fakes for every outside service, including the 10 agent evaluation scenarios and the multi-agent tests (`test_multiagent.py`) |
