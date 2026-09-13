"""The customer's side of dispatch: the tracking page, cancelling, rating.

Every test here goes through the public token, because that token is the only
thing standing between a stranger and somebody's pickup address. What it may
and may not reveal is the point, not an implementation detail.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.config import settings
from app.main import MIN_MEASURED_JOBS

ADMIN = {"x-api-key": settings.admin_api_key}


@pytest.fixture
def add_driver(session_factory):
    def _add(name="Test Driver", available=True, lat=53.4839, lng=-2.3078, age_minutes=0):
        with session_factory() as db:
            driver = models.Driver(
                name=name,
                phone="07700 900999",
                available=available,
                active=True,
                lat=lat,
                lng=lng,
                located_at=datetime.now(timezone.utc) - timedelta(minutes=age_minutes),
            )
            db.add(driver)
            db.commit()
            return driver.id

    return _add


def booking_payload(**overrides):
    payload = {
        "requestId": "trk-1",
        "region": "Manchester",
        "location": "M1 1AA",
        "phone": "07700900123",
        "service": "towing",
        "destination": "Bolton",
        "timing": "now",
        "vehicle": "AB12 CDE silver Focus",
        "pickupLat": 53.4772,
        "pickupLng": -2.2309,
        "price": 95,
    }
    payload.update(overrides)
    return payload


def book(client, **overrides):
    res = client.post("/api/bookings", json=booking_payload(**overrides))
    assert res.status_code == 201, res.text
    return res.json()


def set_status(client, booking_id, status, driver_id=None):
    return client.post(
        f"/api/bookings/{booking_id}/status",
        json={"status": status, "driverId": driver_id},
        headers=ADMIN,
    )


# ── The token ───────────────────────────────────────────────────────────────


def test_every_booking_gets_its_own_token(client):
    a = book(client, requestId="a")
    b = book(client, requestId="b")
    assert a["trackToken"] and b["trackToken"]
    assert a["trackToken"] != b["trackToken"]
    assert len(a["trackToken"]) >= 24


def test_a_retried_booking_keeps_the_same_token(client):
    first = book(client, requestId="same")
    second = book(client, requestId="same")
    assert first["trackToken"] == second["trackToken"]


def test_unknown_token_is_404(client):
    assert client.get("/api/track/not-a-real-token").status_code == 404


def test_tracking_needs_no_key(client):
    token = book(client)["trackToken"]
    res = client.get(f"/api/track/{token}")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "pending"
    assert body["vehicle"] == "AB12 CDE silver Focus"
    assert body["price"] == 95
    assert body["canCancel"] is True


# ── What the page may reveal, and when ──────────────────────────────────────


def test_pending_job_names_no_driver(client, add_driver):
    add_driver()
    token = book(client)["trackToken"]
    body = client.get(f"/api/track/{token}").json()
    assert body["driver"] is None
    assert body["driversOnDuty"] == 1
    # A live wait, measured from the driver who is on duty.
    assert body["etaSource"] == "driver"
    assert body["etaMinutes"] > 0


def test_accepted_job_names_the_driver_but_not_their_position(client, add_driver):
    driver_id = add_driver(name="Dave")
    created = book(client)
    set_status(client, created["bookingId"], "accepted", driver_id)
    body = client.get(f"/api/track/{created['trackToken']}").json()
    assert body["status"] == "accepted"
    assert body["driver"]["name"] == "Dave"
    assert body["driver"]["lat"] is None and body["driver"]["lng"] is None


def test_position_is_shared_only_while_on_the_way(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    token = created["trackToken"]

    set_status(client, created["bookingId"], "en_route", driver_id)
    en_route = client.get(f"/api/track/{token}").json()
    assert en_route["driver"]["lat"] == pytest.approx(53.4839)
    assert en_route["driver"]["lng"] == pytest.approx(-2.3078)
    assert en_route["etaSource"] == "driver"

    set_status(client, created["bookingId"], "on_scene", driver_id)
    on_scene = client.get(f"/api/track/{token}").json()
    assert on_scene["driver"]["name"]
    assert on_scene["driver"]["lat"] is None
    assert on_scene["etaMinutes"] == 0


def test_a_stale_position_is_not_shared(client, add_driver):
    driver_id = add_driver(age_minutes=30)
    created = book(client)
    set_status(client, created["bookingId"], "en_route", driver_id)
    body = client.get(f"/api/track/{created['trackToken']}").json()
    assert body["driver"]["lat"] is None
    assert body["etaSource"] == "fallback"


# ── Timestamps ──────────────────────────────────────────────────────────────


def test_each_step_is_timestamped(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    job = created["bookingId"]
    for status in ("accepted", "en_route", "on_scene", "complete"):
        assert set_status(client, job, status, driver_id).status_code == 200
    body = client.get(f"/api/track/{created['trackToken']}").json()
    assert body["acceptedAt"] and body["enRouteAt"] and body["onSceneAt"] and body["finishedAt"]
    assert body["canCancel"] is False


def test_skipping_straight_to_on_scene_still_fills_the_earlier_steps(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    set_status(client, created["bookingId"], "on_scene", driver_id)
    body = client.get(f"/api/track/{created['trackToken']}").json()
    assert body["acceptedAt"] and body["enRouteAt"] and body["onSceneAt"]


# ── Two trucks, one car ─────────────────────────────────────────────────────


def test_a_job_cannot_be_taken_from_another_driver(client, add_driver):
    dave = add_driver(name="Dave")
    sam = add_driver(name="Sam")
    created = book(client)
    assert set_status(client, created["bookingId"], "accepted", dave).status_code == 200
    assert set_status(client, created["bookingId"], "en_route", sam).status_code == 409
    # Dave carries on unaffected.
    assert set_status(client, created["bookingId"], "en_route", dave).status_code == 200


# ── Cancelling ──────────────────────────────────────────────────────────────


def test_customer_can_cancel_and_the_truck_is_freed(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    set_status(client, created["bookingId"], "en_route", driver_id)

    res = client.post(f"/api/track/{created['trackToken']}/cancel")
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert res.json()["cancelledBy"] == "customer"

    driver = client.get("/api/drivers", headers=ADMIN).json()[0]
    assert driver["currentBookingId"] is None
    assert driver["busyUntil"] is None


def test_cannot_cancel_once_the_driver_is_on_scene(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    set_status(client, created["bookingId"], "on_scene", driver_id)
    assert client.post(f"/api/track/{created['trackToken']}/cancel").status_code == 409


def test_cancelling_twice_is_refused(client):
    created = book(client)
    assert client.post(f"/api/track/{created['trackToken']}/cancel").status_code == 200
    assert client.post(f"/api/track/{created['trackToken']}/cancel").status_code == 409


def test_a_cancelled_job_cannot_be_taken(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    client.post(f"/api/track/{created['trackToken']}/cancel")
    assert set_status(client, created["bookingId"], "accepted", driver_id).status_code == 409


def test_driver_cancelling_is_recorded_as_such(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    set_status(client, created["bookingId"], "accepted", driver_id)
    set_status(client, created["bookingId"], "cancelled", driver_id)
    body = client.get(f"/api/track/{created['trackToken']}").json()
    assert body["cancelledBy"] == "driver"


# ── Rating ──────────────────────────────────────────────────────────────────


def test_rating_waits_for_the_job_to_finish(client, add_driver):
    driver_id = add_driver()
    created = book(client)
    token = created["trackToken"]
    assert client.post(f"/api/track/{token}/rating", json={"rating": 5}).status_code == 409

    for status in ("accepted", "en_route", "on_scene", "complete"):
        set_status(client, created["bookingId"], status, driver_id)

    res = client.post(f"/api/track/{token}/rating", json={"rating": 4, "comment": "Quick."})
    assert res.status_code == 200
    assert res.json()["rating"] == 4

    admin_row = client.get("/api/bookings", headers=ADMIN).json()[0]
    assert admin_row["rating"] == 4
    assert admin_row["ratingComment"] == "Quick."
    assert admin_row["driverName"] == "Test Driver"


def test_rating_must_be_one_to_five(client):
    token = book(client)["trackToken"]
    assert client.post(f"/api/track/{token}/rating", json={"rating": 6}).status_code == 422
    assert client.post(f"/api/track/{token}/rating", json={"rating": 0}).status_code == 422


# ── The dispatch panel's numbers ────────────────────────────────────────────


def test_metrics_are_counted_from_real_bookings_and_drivers(client, add_driver):
    add_driver()
    add_driver(available=False)
    book(client, requestId="m1")
    cancelled = book(client, requestId="m2")
    client.post(f"/api/track/{cancelled['trackToken']}/cancel")

    body = client.get("/api/metrics").json()
    assert body["rescuesToday"] == 1
    assert body["driversAvailable"] == 1
    assert body["measured"] is False


def test_response_time_is_measured_once_enough_jobs_are_timed(client, session_factory):
    with session_factory() as db:
        now = datetime.now(timezone.utc)
        for i in range(MIN_MEASURED_JOBS):
            db.add(
                models.Booking(
                    request_id=f"timed-{i}",
                    track_token=f"tok-{i}",
                    region="Manchester",
                    location="M1 1AA",
                    phone="07700 900123",
                    service="jumpstart",
                    timing="now",
                    status="complete",
                    created_at=now - timedelta(minutes=60),
                    on_scene_at=now - timedelta(minutes=60 - 18),
                )
            )
        db.commit()

    body = client.get("/api/metrics").json()
    assert body["measured"] is True
    assert body["avgResponseMinutes"] == 18


def test_scheduled_collections_do_not_skew_the_response_time(client, session_factory):
    with session_factory() as db:
        now = datetime.now(timezone.utc)
        for i in range(MIN_MEASURED_JOBS):
            db.add(
                models.Booking(
                    request_id=f"sched-{i}",
                    track_token=f"stok-{i}",
                    region="Manchester",
                    location="M1 1AA",
                    phone="07700 900123",
                    service="auction",
                    timing="later",
                    status="complete",
                    created_at=now - timedelta(days=3),
                    on_scene_at=now,
                )
            )
        db.commit()
    body = client.get("/api/metrics").json()
    assert body["measured"] is False
