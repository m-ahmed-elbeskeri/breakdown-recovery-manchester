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
from app.config import settings
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


ADMIN = {"x-api-key": settings.admin_api_key}


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


# ── Deleting a job ──────────────────────────────────────────────────────────


def test_delete_removes_the_job(client, add_driver):
    add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-1")).json()
    res = client.delete(
        f"/api/bookings/{created['bookingId']}", headers=ADMIN
    )
    assert res.status_code == 204
    remaining = client.get("/api/bookings", headers=ADMIN).json()
    assert all(b["id"] != created["bookingId"] for b in remaining)


def test_delete_needs_the_key(client, add_driver):
    add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-2")).json()
    assert client.delete(f"/api/bookings/{created['bookingId']}").status_code == 401


def test_delete_frees_the_truck(client, add_driver):
    """Deleting the job you were driving to must not leave you marked busy."""
    driver_id = add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-3")).json()
    job_id = created["bookingId"]
    client.post(
        f"/api/bookings/{job_id}/status",
        json={"status": "en_route", "driverId": driver_id},
        headers=ADMIN,
    )
    before = client.get("/api/drivers", headers=ADMIN).json()[0]
    assert before["currentBookingId"] == job_id

    client.delete(f"/api/bookings/{job_id}", headers=ADMIN)
    after = client.get("/api/drivers", headers=ADMIN).json()[0]
    assert after["currentBookingId"] is None
    assert after["busyUntil"] is None


def test_delete_unknown_job_is_404(client):
    assert (
        client.delete("/api/bookings/99999", headers=ADMIN).status_code
        == 404
    )


# ── CORS ────────────────────────────────────────────────────────────────────
# The delete endpoint worked perfectly from curl and failed in the browser,
# because allow_methods did not list DELETE and the preflight was refused.
# curl ignores CORS; browsers do not. So assert on the preflight itself.


def _preflight(client, method: str):
    origin = settings.cors_origin_list[0]
    return client.options(
        "/api/bookings/1",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "x-api-key",
        },
    )


def test_browser_may_delete_a_job():
    """A method the console calls must survive the preflight, not just curl."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        res = _preflight(c, "DELETE")
    assert res.status_code == 200, res.text
    assert "DELETE" in res.headers.get("access-control-allow-methods", "")


def test_browser_may_post_and_get():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        for method in ("GET", "POST"):
            res = _preflight(c, method)
            assert res.status_code == 200, f"{method}: {res.text}"
