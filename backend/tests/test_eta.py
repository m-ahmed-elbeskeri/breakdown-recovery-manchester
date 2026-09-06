"""The live-ETA path, and the two endpoints that depend on it.

Written after /api/eta and POST /api/bookings both returned 500 in production
for want of a constant that was never defined. Nothing caught it: the browser
treats a failed ETA lookup as "no answer" and quietly falls back to the
published average, which is right for a stranded customer and hopeless for
noticing the endpoint is dead. So these tests call both endpoints for real and
assert on the status code, not just the shape of a happy answer.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.eta import POSITION_MAX_AGE_MINUTES, position_is_fresh


@pytest.fixture
def add_driver(session_factory):
    def _add(available=True, lat=53.4839, lng=-2.3078, age_minutes=0, busy_minutes=0):
        with session_factory() as db:
            driver = models.Driver(
                name="Test Driver",
                available=available,
                active=True,
                lat=lat,
                lng=lng,
                located_at=datetime.now(timezone.utc) - timedelta(minutes=age_minutes),
                busy_until=(
                    datetime.now(timezone.utc) + timedelta(minutes=busy_minutes)
                    if busy_minutes
                    else None
                ),
            )
            db.add(driver)
            db.commit()
            return driver.id

    return _add


def booking_payload(**overrides):
    payload = {
        "requestId": "eta-1",
        "region": "Manchester",
        "location": "M1 1AA",
        "phone": "07700900123",
        "service": "jumpstart",
        "timing": "now",
        "pickupLat": 53.4772,
        "pickupLng": -2.2309,
    }
    payload.update(overrides)
    return payload


# ── The regression itself ───────────────────────────────────────────────────


def test_eta_endpoint_does_not_error_with_no_drivers(client):
    res = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309})
    assert res.status_code == 200
    assert res.json()["source"] == "fallback"


def test_eta_endpoint_does_not_error_with_a_driver_on_duty(client, add_driver):
    add_driver()
    res = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309})
    assert res.status_code == 200, res.text


def test_booking_survives_the_eta_path(client, add_driver):
    """create_booking asks for a live ETA too — it must not take bookings down."""
    add_driver()
    res = client.post("/api/bookings", json=booking_payload())
    assert res.status_code == 201, res.text
    assert res.json()["eta"] > 0


# ── Behaviour ───────────────────────────────────────────────────────────────


def test_off_duty_drivers_are_not_counted(client, add_driver):
    add_driver(available=False)
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["driversOnDuty"] == 0
    assert body["source"] == "fallback"


def test_a_stale_position_is_treated_as_no_position(client, add_driver):
    # On duty, but the phone stopped reporting a while ago.
    add_driver(age_minutes=POSITION_MAX_AGE_MINUTES + 5)
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["driversOnDuty"] == 1, "still on duty"
    assert body["source"] == "fallback", "but not quotable from a stale position"


def test_a_driver_with_no_position_is_skipped(client, add_driver):
    add_driver(lat=None, lng=None)
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["source"] == "fallback"


def test_eta_never_returns_coordinates(client, add_driver):
    """The public endpoint must not disclose where anybody is."""
    add_driver()
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert set(body) == {"driversOnDuty", "etaMinutes", "queueMinutes", "source"}
    assert "53.48" not in res_text(body)


def res_text(body) -> str:
    import json

    return json.dumps(body)


# ── position_is_fresh ───────────────────────────────────────────────────────


def test_position_freshness_boundaries():
    now = datetime.now(timezone.utc)
    assert position_is_fresh(now) is True
    assert position_is_fresh(now - timedelta(minutes=POSITION_MAX_AGE_MINUTES - 1)) is True
    assert position_is_fresh(now - timedelta(minutes=POSITION_MAX_AGE_MINUTES + 1)) is False
    assert position_is_fresh(None) is False


def test_position_freshness_handles_naive_timestamps():
    """SQLite hands back naive datetimes; they must not raise."""
    naive = datetime.now(timezone.utc).replace(tzinfo=None)
    assert position_is_fresh(naive) is True
