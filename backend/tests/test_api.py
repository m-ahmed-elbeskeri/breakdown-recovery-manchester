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


def test_metrics_are_honest_when_nothing_has_happened(client):
    """No bookings and nobody on duty is reported as exactly that."""
    body = client.get("/api/metrics").json()
    assert body == {
        "rescuesToday": 0,
        "driversAvailable": 0,
        "avgResponseMinutes": 24,
        "measured": False,
    }


def test_metrics_seed_only_supplies_the_response_time(client, seed_metric):
    """The seeded rescue and driver counts are ignored; only the average is a seed."""
    seed_metric(rescues=201, drivers=9, avg=20)
    body = client.get("/api/metrics").json()
    assert body["rescuesToday"] == 0
    assert body["driversAvailable"] == 0
    assert body["avgResponseMinutes"] == 20


def test_create_booking_returns_id_and_eta(client, seed_metric):
    seed_metric(avg=22)
    res = client.post("/api/bookings", json=booking_payload())
    assert res.status_code == 201
    body = res.json()
    assert isinstance(body["bookingId"], int)
    assert body["eta"] == 22  # from the seeded avg response time


def test_booking_is_idempotent_on_request_id(client):
    first = client.post("/api/bookings", json=booking_payload(requestId="dup")).json()
    second = client.post("/api/bookings", json=booking_payload(requestId="dup")).json()

    assert first["bookingId"] == second["bookingId"]
    # One booking exists despite two submits
    assert client.get("/api/metrics").json()["rescuesToday"] == 1


def test_create_booking_validates_payload(client):
    res = client.post("/api/bookings", json={"requestId": "x", "region": "Manchester"})
    assert res.status_code == 422


def test_booking_rejects_a_number_nobody_can_ring(client):
    for phone in ("1234567", "09001234567", "not a number"):
        res = client.post("/api/bookings", json=booking_payload(requestId=f"bad-{phone}", phone=phone))
        assert res.status_code == 422, phone


def test_booking_stores_the_phone_in_one_tidy_shape(client):
    from app.config import settings

    client.post("/api/bookings", json=booking_payload(phone="+44 (0)7700-900-123"))
    rows = client.get("/api/bookings", headers={"x-api-key": settings.admin_api_key}).json()
    assert rows[0]["phone"] == "07700 900123"


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
