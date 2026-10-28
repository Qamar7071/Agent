# Raahi API (Flask)

The API behind the website: the AI agent, the deterministic planner, live weather and road
information, saved trips and booking enquiries. It also serves the built website (`../dist`)
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
| `services/` | `weather.py` (Open-Meteo, PMD alerts), `roads.py` (honest road information), `routing.py` (curated legs, OSRM), `conditions.py` (forecast and roads for a plan), `http.py` (timeouts, caching, User-Agent) |
| `agent/` | `runner.py` (tool loop and limits), `tools.py` (the 11 tools), `prompt.py` (instructions and context), `parser.py` (reads messages without AI), `guided.py` (answers without AI), `llm.py` (OpenAI-compatible client with fallback) |
| `tests/` | pytest suite with fakes for every outside service, including the 10 agent evaluation scenarios |
