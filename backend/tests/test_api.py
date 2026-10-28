"""HTTP API: validation, limits, authorisation, honest 503s and security headers."""
from datetime import date, timedelta

import config
import storage
from security import limiter

TRIP = {"origin": "Islamabad", "destinations": ["hunza"], "days": 6, "adults": 2}


def test_health_reports_configuration_without_secrets(client, monkeypatch):
    monkeypatch.setattr(config, "LLM_API_KEY", "sk-very-secret")
    body = client.get("/api/health").get_json()
    assert body["ok"] and body["ai"]["configured"] and body["storage"]["enabled"]
    assert "sk-very-secret" not in str(body)


def test_plan_validates_input_and_accepts_the_old_body(client):
    ok = client.post("/api/plan", json={"from": "Lahore", "destinations": ["Hunza"], "travelers": 3, "budget": 0})
    assert ok.status_code == 200 and ok.get_json()["itinerary"]["request"]["origin"] == "Lahore"
    bad = client.post("/api/plan", json={"destinations": ["Paris"]})
    assert bad.status_code == 400 and bad.get_json()["error"]["code"] == "validation"
    assert client.post("/api/plan", json={"destinations": []}).status_code == 400
    assert client.post("/api/plan", json={**TRIP, "days": 99}).status_code == 400
    assert client.post("/api/plan", data="hello", content_type="text/plain").status_code == 400


def test_plan_update_keeps_preferences(client):
    r = client.post("/api/plan/update", json={"request": {**TRIP, "budget_pkr": 300000},
                                              "changes": [{"op": "add_destination", "destination": "Attabad"}]})
    req = r.get_json()["itinerary"]["request"]
    assert req["destinations"] == ["hunza", "attabad"] and req["budget_pkr"] == 300000
    bad = client.post("/api/plan/update", json={"request": TRIP, "changes": [{"op": "set", "field": "days",
                                                                              "value": "lots"}]})
    assert bad.status_code == 400


def test_destinations_are_public_and_cacheable(client):
    r = client.get("/api/destinations")
    assert r.status_code == 200 and "max-age" in r.headers["Cache-Control"]
    assert len(r.get_json()["destinations"]) == 8
    one = client.get("/api/destinations/deosai").get_json()
    assert one["destination"]["sources"] and one["stays"]["note"]
    assert client.get("/api/destinations/narnia").status_code == 404


def test_live_endpoints_say_when_services_are_off(client):
    w = client.get("/api/weather?destination=hunza").get_json()
    assert w["available"] is False and "switched off" in w["reason"]
    roads = client.get("/api/roads?destinations=hunza,skardu").get_json()
    assert roads["status"] == "not_verified"
    route = client.get("/api/route?from=Islamabad&to=Skardu").get_json()
    assert route["curated_estimate"]["driving_days"] == 2 and route["routing_engine"]["available"] is False
    assert client.get("/api/route?from=Mars&to=Skardu").status_code == 400


def test_conditions_endpoint(client):
    start = (date.today() + timedelta(days=3)).isoformat()
    r = client.post("/api/conditions", json={"destinations": ["hunza"], "start_date": start, "days": 3})
    body = r.get_json()
    assert r.status_code == 200 and body["roads"]["status"] == "not_verified"
    assert body["forecasts"]["hunza"]["available"] is False


def test_saved_trip_lifecycle_requires_the_key(client):
    r = client.post("/api/trips", json={"title": "Family trip", "request": TRIP})
    assert r.status_code == 201
    trip_id, token = r.get_json()["trip"]["id"], r.get_json()["token"]
    assert client.get(f"/api/trips/{trip_id}").status_code == 401
    assert client.get(f"/api/trips/{trip_id}", headers={"X-Trip-Token": "w" * 32}).status_code == 404
    assert client.get("/api/trips/not-an-id", headers={"X-Trip-Token": token}).status_code == 404
    got = client.get(f"/api/trips/{trip_id}", headers={"X-Trip-Token": token}).get_json()["trip"]
    assert got["title"] == "Family trip" and got["itinerary"]["days"]
    put = client.put(f"/api/trips/{trip_id}", json={"request": {**TRIP, "days": 8}}, headers={"X-Trip-Token": token})
    assert len(put.get_json()["trip"]["itinerary"]["days"]) == 8
    assert client.delete(f"/api/trips/{trip_id}", headers={"X-Trip-Token": token}).status_code == 204


def test_without_a_database_saving_is_honestly_unavailable(client):
    storage.reset_for_tests(None)
    r = client.post("/api/trips", json={"request": TRIP})
    assert r.status_code == 503 and "no database" in r.get_json()["error"]["message"]
    assert client.get("/api/health").get_json()["enquiries_open"] is False


ENQUIRY = {"name": "Sana", "contact_method": "whatsapp", "contact_value": "+92 300 1234567", "message": "Help please",
           "request": TRIP, "consent": True}


def test_enquiry_requires_consent_and_valid_contact(client):
    assert client.post("/api/enquiries", json={**ENQUIRY, "consent": False}).status_code == 400
    assert client.post("/api/enquiries", json={**ENQUIRY, "contact_value": "call me"}).status_code == 400
    assert client.post("/api/enquiries", json={**ENQUIRY, "contact_method": "email",
                                                 "contact_value": "not-an-email"}).status_code == 400
    assert client.post("/api/enquiries", json={**ENQUIRY, "website": "spam.example"}).status_code == 400


def test_enquiry_flow_never_claims_a_booking(client, admin_headers):
    consent = client.get("/api/enquiries/consent").get_json()
    assert consent["open"] and "not a booking" in consent["text"]
    r = client.post("/api/enquiries", json=ENQUIRY)
    body = r.get_json()
    assert r.status_code == 201 and body["booking_confirmed"] is False
    assert "not a booking" in body["message"] and "nothing has been reserved or paid" in body["message"]
    ref, token = body["enquiry"]["reference"], body["token"]
    assert "Hunza Valley" in body["enquiry"]["summary"]
    status = client.get(f"/api/enquiries/{ref}", headers={"X-Enquiry-Token": token}).get_json()["enquiry"]
    assert status["status"] == "new" and "contact_value" not in status

    assert client.get("/api/admin/enquiries").status_code == 401
    assert client.get("/api/admin/enquiries", headers={"Authorization": "Bearer wrong"}).status_code == 401
    listed = client.get("/api/admin/enquiries", headers=admin_headers).get_json()["enquiries"]
    assert listed[0]["contact_value"] == "+92 300 1234567"
    upd = client.patch(f"/api/admin/enquiries/{ref}", json={"status": "contacted"}, headers=admin_headers)
    assert upd.get_json()["enquiry"]["status"] == "contacted"
    assert client.patch(f"/api/admin/enquiries/{ref}", json={"status": "booked"}, headers=admin_headers).status_code == 400
    assert client.delete(f"/api/enquiries/{ref}", headers={"X-Enquiry-Token": token}).status_code == 204


def test_enquiries_close_when_nobody_can_review_them(client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "")
    r = client.post("/api/enquiries", json=ENQUIRY)
    assert r.status_code == 503 and "Nothing was sent" in r.get_json()["error"]["message"]
    assert client.get("/api/admin/enquiries", headers={"Authorization": "Bearer x"}).status_code == 503


def test_rate_limit_and_body_size(client, monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MIN", 3)
    codes = [client.post("/api/chat", json={"message": "hi"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    limited = client.post("/api/chat", json={"message": "hi"})
    assert limited.headers["Retry-After"] and limited.get_json()["error"]["code"] == "rate_limited"
    limiter.reset()
    big = client.post("/api/chat", data='{"message": "' + "x" * (config.MAX_BODY_BYTES + 10) + '"}',
                      content_type="application/json")
    assert big.status_code == 413
    assert client.post("/api/chat", json={"message": "x" * 2001}).status_code == 400
    assert client.post("/api/chat", json={"message": "   "}).status_code == 400


def test_cors_allows_only_known_origins(client):
    ok = client.options("/api/chat", headers={"Origin": "https://north-kappa-ivory.vercel.app",
                                               "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "https://north-kappa-ivory.vercel.app"
    evil = client.options("/api/chat", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "Access-Control-Allow-Origin" not in evil.headers


def test_security_headers_and_json_errors(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["Cache-Control"] == "no-store"
    missing = client.get("/api/nothing-here")
    assert missing.status_code == 404 and missing.get_json()["error"]["code"] == "not_found"
    assert client.delete("/api/health").status_code == 405


def test_chat_endpoint_returns_structured_results(client):
    body = client.post("/api/chat", json={"message": "Plan 6 days in Hunza for 2 people"}).get_json()
    assert body["mode"] == "guided" and body["itinerary"]["title"] == "Hunza Valley"
    assert body["state"]["destinations"] == ["hunza"] and isinstance(body["trace"], list)
    again = client.post("/api/chat", json={"message": "add Attabad", "state": body["state"],
                                           "history": [{"role": "user", "content": "Plan 6 days in Hunza"},
                                                       {"role": "assistant", "content": body["reply"]}]}).get_json()
    assert again["itinerary"]["request"]["destinations"] == ["hunza", "attabad"]
