def booking_payload(**overrides):
    payload = {
        "requestId": "req-1",
        "region": "Manchester",
        "location": "M1 1AA",
        "phone": "07700900123",
        "service": "towing",
        "timing": "now",
        "destination": "Bolton",
        "distanceMiles": 8.2,
        "durationMinutes": 19,
        "price": 70,
    }
    payload.update(overrides)
    return payload


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_metrics_defaults_when_unseeded(client):
    body = client.get("/api/metrics").json()
    assert body == {"rescuesToday": 148, "driversAvailable": 7, "avgResponseMinutes": 24}


def test_metrics_reads_seeded_row(client, seed_metric):
    seed_metric(rescues=201, drivers=9, avg=20)
    body = client.get("/api/metrics").json()
    assert body == {"rescuesToday": 201, "driversAvailable": 9, "avgResponseMinutes": 20}


def test_create_booking_returns_id_and_eta(client, seed_metric):
    seed_metric(avg=22)
    res = client.post("/api/bookings", json=booking_payload())
    assert res.status_code == 201
    body = res.json()
    assert isinstance(body["bookingId"], int)
    assert body["eta"] == 22  # from the seeded avg response time


def test_booking_is_idempotent_on_request_id(client, seed_metric):
    seed_metric(rescues=148)
    first = client.post("/api/bookings", json=booking_payload(requestId="dup")).json()
    second = client.post("/api/bookings", json=booking_payload(requestId="dup")).json()

    assert first["bookingId"] == second["bookingId"]
    # rescues_today incremented exactly once despite two submits
    assert client.get("/api/metrics").json()["rescuesToday"] == 149


def test_create_booking_validates_payload(client):
    res = client.post("/api/bookings", json={"requestId": "x", "region": "Manchester"})
    assert res.status_code == 422


def test_admin_list_requires_api_key(client):
    from app.config import settings

    client.post("/api/bookings", json=booking_payload())

    assert client.get("/api/bookings").status_code == 401
    assert client.get("/api/bookings", headers={"x-api-key": "definitely-wrong"}).status_code == 401

    ok = client.get("/api/bookings", headers={"x-api-key": settings.admin_api_key})
    assert ok.status_code == 200
    rows = ok.json()
    assert len(rows) == 1
    assert rows[0]["price"] == 70
    assert rows[0]["distanceMiles"] == 8.2
