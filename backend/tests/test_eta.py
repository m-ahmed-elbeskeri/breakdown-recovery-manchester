"""The live-ETA path, and the endpoints that depend on it.

Written after /api/eta and POST /api/bookings both returned 500 in production
for want of a constant that was never defined. These tests call both endpoints
for real and assert on the status code, not just the shape of a happy answer.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.config import settings
from app.eta import POSITION_MAX_AGE_MINUTES, position_is_fresh


@pytest.fixture
def add_driver(compliant_driver, session_factory):
    def _add(available=True, lat=53.4839, lng=-2.3078, age_minutes=0, busy_minutes=0, **fields):
        driver_id = compliant_driver(
            available=available,
            lat=lat,
            lng=lng,
            located_at=datetime.now(timezone.utc) - timedelta(minutes=age_minutes),
            busy_until=(
                datetime.now(timezone.utc) + timedelta(minutes=busy_minutes)
                if busy_minutes
                else None
            ),
            **fields,
        )
        return driver_id

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


def test_drivers_not_yet_approved_are_never_quoted(client, add_driver):
    """An applicant who somehow shows as available must not be counted or measured."""
    add_driver(application_status="submitted")
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["driversOnDuty"] == 0
    assert body["source"] == "fallback"


def test_a_stale_position_is_treated_as_no_position(client, add_driver):
    add_driver(age_minutes=POSITION_MAX_AGE_MINUTES + 5)
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["driversOnDuty"] == 1, "still on duty"
    assert body["source"] == "fallback", "but not quotable from a stale position"


def test_a_driver_with_no_position_is_skipped(client, add_driver):
    add_driver(lat=None, lng=None)
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert body["source"] == "fallback"


def test_eta_never_returns_coordinates(client, add_driver):
    import json

    add_driver()
    body = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert set(body) == {"driversOnDuty", "etaMinutes", "queueMinutes", "source"}
    assert "53.48" not in json.dumps(body)


# ── position_is_fresh ───────────────────────────────────────────────────────


def test_position_freshness_boundaries():
    moment = datetime.now(timezone.utc)
    assert position_is_fresh(moment) is True
    assert position_is_fresh(moment - timedelta(minutes=POSITION_MAX_AGE_MINUTES - 1)) is True
    assert position_is_fresh(moment - timedelta(minutes=POSITION_MAX_AGE_MINUTES + 1)) is False
    assert position_is_fresh(None) is False


def test_position_freshness_handles_naive_timestamps():
    naive = datetime.now(timezone.utc).replace(tzinfo=None)
    assert position_is_fresh(naive) is True


# ── Deleting a job ──────────────────────────────────────────────────────────


def test_delete_removes_the_job(client, add_driver, admin_headers):
    add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-1")).json()
    res = client.delete(f"/api/bookings/{created['bookingId']}", headers=admin_headers)
    assert res.status_code == 204
    remaining = client.get("/api/bookings", headers=admin_headers).json()
    assert all(b["id"] != created["bookingId"] for b in remaining)


def test_delete_needs_an_admin(client, add_driver):
    add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-2")).json()
    assert client.delete(f"/api/bookings/{created['bookingId']}").status_code == 401


def test_delete_frees_the_truck(client, add_driver, admin_headers):
    driver_id = add_driver()
    created = client.post("/api/bookings", json=booking_payload(requestId="del-3")).json()
    job_id = created["bookingId"]
    res = client.post(
        f"/api/bookings/{job_id}/status",
        json={"status": "en_route", "driverId": driver_id},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    before = client.get("/api/drivers", headers=admin_headers).json()[0]
    assert before["currentBookingId"] == job_id

    client.delete(f"/api/bookings/{job_id}", headers=admin_headers)
    after = client.get("/api/drivers", headers=admin_headers).json()[0]
    assert after["currentBookingId"] is None
    assert after["busyUntil"] is None


def test_delete_unknown_job_is_404(client, admin_headers):
    assert client.delete("/api/bookings/99999", headers=admin_headers).status_code == 404


# ── CORS ────────────────────────────────────────────────────────────────────


def _preflight(client, method: str):
    origin = settings.cors_origin_list[0]
    return client.options(
        "/api/bookings/1",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization",
        },
    )


def test_browser_may_delete_a_job():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        res = _preflight(c, "DELETE")
    assert res.status_code == 200, res.text
    assert "DELETE" in res.headers.get("access-control-allow-methods", "")


def test_browser_may_post_and_get_with_a_bearer_token():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        for method in ("GET", "POST"):
            res = _preflight(c, method)
            assert res.status_code == 200, f"{method}: {res.text}"


# ── The driver correcting their own free-at time ────────────────────────────


def test_admin_can_set_how_long_a_driver_will_be(client, add_driver, admin_headers):
    driver_id = add_driver()
    res = client.post(
        f"/api/drivers/{driver_id}/state", json={"busyMinutes": 45}, headers=admin_headers
    )
    assert res.status_code == 200, res.text
    assert 43 <= res.json()["busyMinutes"] <= 45


def test_driver_can_declare_themselves_free(client, add_driver, admin_headers):
    driver_id = add_driver(busy_minutes=60)
    res = client.post(
        f"/api/drivers/{driver_id}/state", json={"busyMinutes": 0}, headers=admin_headers
    )
    assert res.json()["busyMinutes"] == 0
    assert res.json()["busyUntil"] is None


def test_an_edited_free_time_reaches_the_customer_quote(client, add_driver, admin_headers):
    driver_id = add_driver()
    before = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    client.post(f"/api/drivers/{driver_id}/state", json={"busyMinutes": 90}, headers=admin_headers)
    after = client.get("/api/eta", params={"lat": 53.4772, "lng": -2.2309}).json()
    assert after["queueMinutes"] >= 88
    assert after["etaMinutes"] > before["etaMinutes"]


def test_busy_minutes_is_capped(client, add_driver, admin_headers):
    driver_id = add_driver()
    res = client.post(
        f"/api/drivers/{driver_id}/state", json={"busyMinutes": 100000}, headers=admin_headers
    )
    assert res.status_code == 422


# ── The confirmation screen must know whether a driver was assigned ─────────


def test_booking_reports_a_measured_eta_as_such(client, add_driver):
    add_driver()
    body = client.post("/api/bookings", json=booking_payload(requestId="src-1")).json()
    assert body["etaSource"] == "driver"


def test_booking_reports_a_fallback_when_nobody_is_on_duty(client):
    body = client.post("/api/bookings", json=booking_payload(requestId="src-2")).json()
    assert body["etaSource"] == "fallback"


def test_booking_reports_a_fallback_when_the_position_is_stale(client, add_driver):
    add_driver(age_minutes=POSITION_MAX_AGE_MINUTES + 5)
    body = client.post("/api/bookings", json=booking_payload(requestId="src-3")).json()
    assert body["etaSource"] == "fallback"


def test_booking_without_coordinates_falls_back(client, add_driver):
    add_driver()
    body = client.post(
        "/api/bookings",
        json=booking_payload(requestId="src-4", pickupLat=None, pickupLng=None),
    ).json()
    assert body["etaSource"] == "fallback"


def test_models_import_cleanly():
    assert models.Driver.__tablename__ == "drivers"
