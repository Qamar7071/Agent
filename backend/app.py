"""Raahi backend — Flask app.

Routes:
    POST /api/chat   { message, history } -> agent reply (thinking + adaptive)
    POST /api/plan   { from, destinations, start_date, days, travelers, budget_pkr, interests, transport }
    GET  /api/health
    GET  /*          serves the built React frontend (../dist) in production

Run locally:
    pip install -r requirements.txt
    (build the frontend once:  cd ..  &&  npm install && npm run build)
    cp .env.example .env   # add your LLM_API_KEY
    python app.py          # http://localhost:5000
"""
import os

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

import agent

DIST = os.path.join(os.path.dirname(__file__), "..", "dist")
app = Flask(__name__, static_folder=DIST, static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "llm": bool(os.environ.get("LLM_API_KEY", "").strip()), "model": os.environ.get("LLM_MODEL", "gpt-4o-mini")})


@app.post("/api/chat")
def chat():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400
    history = body.get("history") or []
    return jsonify(agent.chat(message, history))


@app.post("/api/plan")
def plan():
    body = request.get_json(silent=True) or {}
    form = {
        "from": body.get("from", "Islamabad"),
        "destinations": body.get("destinations", []),
        "start_date": body.get("start_date"),
        "days": body.get("days", 7),
        "travelers": body.get("travelers", 2),
        "budget": body.get("budget_pkr", body.get("budget", 0)),
        "interests": body.get("interests", []),
        "transport": body.get("transport", "car"),
    }
    if not form["destinations"]:
        return jsonify({"error": "Pick at least one destination."}), 400
    return jsonify(agent.plan(form))


# ── Serve the built frontend (production) ─────────────────────────────────────
@app.get("/")
def index():
    if os.path.isdir(DIST):
        return send_from_directory(DIST, "index.html")
    return jsonify({"ok": True, "msg": "Raahi API running. Build the frontend (npm run build) to serve the site here."})


@app.errorhandler(404)
def spa(_):
    # Let client-side routing handle unknown non-API paths.
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    if os.path.isfile(os.path.join(DIST, "index.html")):
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "not found"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
