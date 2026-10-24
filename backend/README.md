# Raahi backend (the agent)

Flask app that powers the AI travel agent and serves the built frontend.

## Files
- `app.py` — routes (`/api/chat`, `/api/plan`, `/api/health`) + serves `../dist`
- `agent.py` — the LLM agent: system prompt (flipped-interaction + adaptation + honesty), calls any OpenAI-compatible API
- `tools.py` — live weather (Open-Meteo), destination matching, Google Maps links, the deterministic trip planner (distances + budget + stays)
- `data.py` — curated Northern Pakistan data (mirror of the frontend's)

## The agent's behaviour lives in `agent.py` → `SYSTEM_PROMPT`
That's where the "thinking" is defined: it asks clarifying questions before planning, adapts to the user, and is grounded with live weather + the curated guide. Edit that prompt to change how the agent behaves.

## Run
```bash
pip install -r requirements.txt
cp .env.example .env     # add LLM_API_KEY, pick a provider in LLM_BASE_URL/LLM_MODEL
python app.py            # http://localhost:5000  (build the frontend first: cd .. && npm run build)
```

## Endpoints
- `POST /api/chat` `{ message, history: [{role, content}] }` → `{ reply, destinations?, itinerary?, actions? }`
- `POST /api/plan` `{ from, destinations[], start_date, days, travelers, budget_pkr, interests[], transport }` → `{ itinerary: { title, summary, budget, stayRecs, days[...] } }`
- `GET /api/health` → `{ ok, llm, model }`

## Notes
- **No keys** for weather (Open-Meteo) or Google Maps links.
- The **planner is deterministic** — real distances, a transparent budget, indicative stay prices. It never invents live prices, road status or availability.
- Keep your `LLM_API_KEY` in `.env` (gitignored), never in frontend code.
- To add live hotel prices / exact road distances, call Google Places / Distance Matrix **here** in `tools.py` and return the data — the frontend already renders it.
