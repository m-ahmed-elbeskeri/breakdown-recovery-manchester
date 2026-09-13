import secrets
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas
from .config import settings
from .db import get_db
from .eta import (
    drive_minutes,
    estimate_finish_minutes,
    minutes_until,
    position_is_fresh,
)
from .notify import BookingDetails, send_booking_notification

app = FastAPI(title="Car Recovery Near Me API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # DELETE is here for the driver console clearing a job. Listed explicitly
    # rather than "*" so adding a destructive method stays a deliberate act.
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# The published average response, used until enough jobs have been timed to
# replace it with a measured one.
DEFAULT_AVG_RESPONSE_MINUTES = 24
# How many real, timed callouts it takes before the site quotes the measured
# figure instead of the seeded one. Five is enough that a single slow night
# does not swing it wildly; fewer and the number would jump about.
MIN_MEASURED_JOBS = 5
MEASURED_WINDOW_DAYS = 30

ACTIVE_STATUSES = ("accepted", "en_route", "on_scene")
FINISHED_STATUSES = ("complete", "cancelled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat them as the UTC they were stored as."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _iso(value: datetime | None) -> str | None:
    value = _aware(value)
    return value.isoformat() if value else None


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def _seed_avg_response(db: Session) -> int:
    metric = db.scalars(select(models.Metric)).first()
    return metric.avg_response_minutes if metric else DEFAULT_AVG_RESPONSE_MINUTES


def measured_response_minutes(db: Session) -> int | None:
    """The real average from booking to driver on scene, or None until there
    are enough timed jobs to say. Scheduled collections are excluded: a
    booking made on Monday for Thursday is not a 4,000-minute response."""
    since = _now() - timedelta(days=MEASURED_WINDOW_DAYS)
    rows = db.scalars(
        select(models.Booking).where(
            models.Booking.timing == "now",
            models.Booking.on_scene_at.is_not(None),
            models.Booking.created_at >= since,
        )
    ).all()
    samples = [
        (_aware(b.on_scene_at) - _aware(b.created_at)).total_seconds() / 60
        for b in rows
        if b.on_scene_at and b.created_at
    ]
    samples = [s for s in samples if 0 < s < 24 * 60]
    if len(samples) < MIN_MEASURED_JOBS:
        return None
    return max(1, round(sum(samples) / len(samples)))


@app.get("/api/metrics", response_model=schemas.MetricsOut)
def get_metrics(db: Session = Depends(get_db)) -> schemas.MetricsOut:
    """The dispatch panel's figures, all of them real.

    Rescues are bookings taken in the last 24 hours, drivers are the ones on
    duty right now, and the response time is measured from the timestamps on
    real jobs once there are enough of them. Nothing here is a counter that
    somebody typed in, because a customer who catches one invented number
    stops believing the rest.
    """
    since = _now() - timedelta(hours=24)
    rescues = db.scalar(
        select(func.count())
        .select_from(models.Booking)
        .where(models.Booking.created_at >= since, models.Booking.status != "cancelled")
    )
    on_duty = db.scalar(
        select(func.count())
        .select_from(models.Driver)
        .where(models.Driver.active, models.Driver.available)
    )
    measured = measured_response_minutes(db)
    return schemas.MetricsOut(
        rescuesToday=int(rescues or 0),
        driversAvailable=int(on_duty or 0),
        avgResponseMinutes=measured if measured is not None else _seed_avg_response(db),
        measured=measured is not None,
    )


@app.post("/api/bookings", response_model=schemas.BookingCreated, status_code=201)
def create_booking(
    payload: schemas.BookingCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> schemas.BookingCreated:
    eta = measured_response_minutes(db) or _seed_avg_response(db)

    # If the driver is on duty and we know where they are, the customer gets a
    # real wait — drive time plus whatever is left of the job in front of them —
    # rather than the site-wide average.
    live, _queue = best_eta(db, payload.pickupLat, payload.pickupLng)
    eta_source = "fallback"
    if live is not None:
        eta = live
        eta_source = "driver"

    # Idempotency: a retry with the same requestId returns the original booking
    # (and does not re-notify).
    existing = db.scalars(
        select(models.Booking).where(models.Booking.request_id == payload.requestId)
    ).first()
    if existing is not None:
        return schemas.BookingCreated(
            bookingId=existing.id, eta=eta, etaSource=eta_source, trackToken=existing.track_token
        )

    booking = models.Booking(
        request_id=payload.requestId,
        track_token=secrets.token_urlsafe(24),
        region=payload.region,
        location=payload.location,
        destination=payload.destination,
        phone=payload.phone,
        service=payload.service,
        timing=payload.timing,
        scheduled_for=payload.scheduledFor,
        vehicle=payload.vehicle,
        pickup_lat=payload.pickupLat,
        pickup_lng=payload.pickupLng,
        motorway=payload.motorway,
        distance_miles=payload.distanceMiles,
        duration_minutes=payload.durationMinutes,
        price=payload.price,
        status="pending",
    )
    db.add(booking)

    try:
        db.commit()
    except IntegrityError:
        # A concurrent request inserted the same requestId first — return that one.
        db.rollback()
        existing = db.scalars(
            select(models.Booking).where(models.Booking.request_id == payload.requestId)
        ).first()
        if existing is None:
            raise
        return schemas.BookingCreated(
            bookingId=existing.id, eta=eta, etaSource=eta_source, trackToken=existing.track_token
        )

    db.refresh(booking)

    # Fire the operator alert after the response (best-effort). Snapshot the
    # fields now, since the ORM object's session closes once the request ends.
    details: BookingDetails = {
        "id": booking.id,
        "region": booking.region,
        "location": booking.location,
        "destination": booking.destination,
        "phone": booking.phone,
        "service": booking.service,
        "timing": booking.timing,
        "scheduled_for": booking.scheduled_for,
        "vehicle": booking.vehicle,
        "pickup_lat": booking.pickup_lat,
        "pickup_lng": booking.pickup_lng,
        "motorway": booking.motorway,
        "distance_miles": booking.distance_miles,
        "duration_minutes": booking.duration_minutes,
        "price": booking.price,
        "track_token": booking.track_token,
    }
    background.add_task(send_booking_notification, details)

    return schemas.BookingCreated(
        bookingId=booking.id, eta=eta, etaSource=eta_source, trackToken=booking.track_token
    )


def require_admin(x_api_key: str = Header(default="")) -> None:
    if x_api_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _driver_names(db: Session) -> dict[int, str]:
    return {d.id: d.name for d in db.scalars(select(models.Driver)).all()}


@app.get(
    "/api/bookings",
    response_model=list[schemas.BookingOut],
    dependencies=[Depends(require_admin)],
)
def list_bookings(limit: int = 50, db: Session = Depends(get_db)) -> list[schemas.BookingOut]:
    rows = db.scalars(
        select(models.Booking).order_by(models.Booking.created_at.desc()).limit(min(limit, 200))
    ).all()
    names = _driver_names(db)
    return [_booking_out(b, names) for b in rows]


def _booking_out(b: models.Booking, names: dict[int, str] | None = None) -> schemas.BookingOut:
    return schemas.BookingOut(
        id=b.id,
        region=b.region,
        location=b.location,
        destination=b.destination,
        phone=b.phone,
        service=b.service,
        timing=b.timing,
        scheduledFor=b.scheduled_for,
        vehicle=b.vehicle,
        pickupLat=b.pickup_lat,
        pickupLng=b.pickup_lng,
        motorway=b.motorway,
        distanceMiles=b.distance_miles,
        durationMinutes=b.duration_minutes,
        price=b.price,
        driverId=b.driver_id,
        driverName=(names or {}).get(b.driver_id) if b.driver_id is not None else None,
        status=b.status,
        trackToken=b.track_token,
        createdAt=_iso(b.created_at) or "",
        acceptedAt=_iso(b.accepted_at),
        enRouteAt=_iso(b.en_route_at),
        onSceneAt=_iso(b.on_scene_at),
        finishedAt=_iso(b.finished_at),
        cancelledBy=b.cancelled_by,
        rating=b.rating,
        ratingComment=b.rating_comment,
    )


# -- Drivers -----------------------------------------------------------------


def _driver_out(d: models.Driver) -> schemas.DriverOut:
    return schemas.DriverOut(
        id=d.id,
        name=d.name,
        phone=d.phone,
        available=d.available,
        lat=d.lat,
        lng=d.lng,
        locatedAt=_iso(d.located_at),
        currentBookingId=d.current_booking_id,
        busyUntil=_iso(d.busy_until),
        busyMinutes=minutes_until(d.busy_until),
    )


def _get_driver(db: Session, driver_id: int) -> models.Driver:
    driver = db.get(models.Driver, driver_id)
    if driver is None or not driver.active:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


def best_eta(db: Session, lat: float | None, lng: float | None) -> tuple[int | None, int]:
    """Minutes until the soonest driver could reach (lat, lng), and their queue.

    Whoever can be there first wins - which for a driver mid-job means the time
    left on it plus the drive afterwards, so a nearby-but-busy truck does not
    beat a free one further out. Returns (None, 0) when nobody is on duty or no
    route can be found, and the caller falls back to the published average
    rather than inventing a number.
    """
    if lat is None or lng is None:
        return None, 0

    on_duty = db.scalars(
        select(models.Driver).where(models.Driver.active, models.Driver.available)
    ).all()

    best: tuple[int, int] | None = None
    for d in on_duty:
        # A position we have stopped receiving is not a position.
        if d.lat is None or d.lng is None or not position_is_fresh(d.located_at):
            continue
        travel = drive_minutes(d.lat, d.lng, lat, lng)
        if travel is None:
            continue
        queue = minutes_until(d.busy_until)
        total = travel + queue
        if best is None or total < best[0]:
            best = (total, queue)
    return best if best else (None, 0)


def _drivers_on_duty(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(models.Driver)
            .where(models.Driver.active, models.Driver.available)
        )
        or 0
    )


@app.get("/api/eta", response_model=schemas.EtaOut)
def get_eta(lat: float, lng: float, db: Session = Depends(get_db)) -> schemas.EtaOut:
    """Public. Answers in minutes and never discloses where any driver is."""
    minutes, queue = best_eta(db, lat, lng)
    on_duty = _drivers_on_duty(db)
    if minutes is None:
        return schemas.EtaOut(
            driversOnDuty=on_duty,
            etaMinutes=measured_response_minutes(db) or _seed_avg_response(db),
            queueMinutes=0,
            source="fallback",
        )
    return schemas.EtaOut(
        driversOnDuty=on_duty,
        etaMinutes=minutes,
        queueMinutes=queue,
        source="driver",
    )


@app.get(
    "/api/drivers",
    response_model=list[schemas.DriverOut],
    dependencies=[Depends(require_admin)],
)
def list_drivers(db: Session = Depends(get_db)) -> list[schemas.DriverOut]:
    rows = db.scalars(
        select(models.Driver).where(models.Driver.active).order_by(models.Driver.id)
    ).all()
    return [_driver_out(d) for d in rows]


@app.post(
    "/api/drivers",
    response_model=schemas.DriverOut,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_driver(
    payload: schemas.DriverCreate, db: Session = Depends(get_db)
) -> schemas.DriverOut:
    driver = models.Driver(name=payload.name.strip(), phone=payload.phone)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return _driver_out(driver)


@app.delete(
    "/api/drivers/{driver_id}",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
def retire_driver(driver_id: int, db: Session = Depends(get_db)) -> None:
    """Take a driver off the roster. A soft delete: their past jobs still name
    them, and dispatch simply stops asking them."""
    driver = _get_driver(db, driver_id)
    driver.active = False
    driver.available = False
    driver.current_booking_id = None
    driver.busy_until = None
    db.commit()


@app.post(
    "/api/drivers/{driver_id}/state",
    response_model=schemas.DriverOut,
    dependencies=[Depends(require_admin)],
)
def set_driver_state(
    driver_id: int, payload: schemas.DriverStateIn, db: Session = Depends(get_db)
) -> schemas.DriverOut:
    driver = _get_driver(db, driver_id)
    if payload.available is not None:
        driver.available = payload.available
    if payload.lat is not None and payload.lng is not None:
        driver.lat, driver.lng = payload.lat, payload.lng
        driver.located_at = _now()
    if payload.busyMinutes is not None:
        # The driver's own read on when they will be free beats the estimate
        # made when they took the job. Zero means done — free right now.
        driver.busy_until = (
            _now() + timedelta(minutes=payload.busyMinutes) if payload.busyMinutes > 0 else None
        )
    db.commit()
    db.refresh(driver)
    return _driver_out(driver)


def _release_holder(db: Session, booking_id: int) -> None:
    """Free whichever truck had this job in hand."""
    holder = db.scalars(
        select(models.Driver).where(models.Driver.current_booking_id == booking_id)
    ).first()
    if holder is not None:
        holder.current_booking_id = None
        holder.busy_until = None


@app.post(
    "/api/bookings/{booking_id}/status",
    response_model=schemas.BookingOut,
    dependencies=[Depends(require_admin)],
)
def set_booking_status(
    booking_id: int, payload: schemas.BookingStatusIn, db: Session = Depends(get_db)
) -> schemas.BookingOut:
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    driver = _get_driver(db, payload.driverId) if payload.driverId is not None else None

    if payload.status in ACTIVE_STATUSES:
        if driver is None:
            raise HTTPException(status_code=400, detail="A driver must be given to take a job")
        # Two trucks setting off for one car is the worst outcome dispatch can
        # produce, so a job that is already someone else's cannot be taken.
        if (
            booking.status in ACTIVE_STATUSES
            and booking.driver_id is not None
            and booking.driver_id != driver.id
        ):
            raise HTTPException(status_code=409, detail="Another driver already has this job")
        if booking.status == "cancelled":
            raise HTTPException(status_code=409, detail="This job was cancelled")

        booking.driver_id = driver.id
        driver.current_booking_id = booking.id
        now = _now()
        if payload.status == "accepted" and booking.accepted_at is None:
            booking.accepted_at = now
            # When the truck comes free, so anyone booking behind this customer
            # is quoted the queue as well as the drive.
            travel = 0
            if driver.lat is not None and booking.pickup_lat is not None:
                travel = (
                    drive_minutes(driver.lat, driver.lng, booking.pickup_lat, booking.pickup_lng)
                    or 0
                )
            remaining = estimate_finish_minutes(travel, booking.duration_minutes)
            driver.busy_until = now + timedelta(minutes=remaining)
        elif payload.status == "en_route":
            booking.accepted_at = booking.accepted_at or now
            booking.en_route_at = booking.en_route_at or now
        elif payload.status == "on_scene":
            booking.accepted_at = booking.accepted_at or now
            booking.en_route_at = booking.en_route_at or now
            booking.on_scene_at = booking.on_scene_at or now
    elif payload.status in FINISHED_STATUSES:
        booking.finished_at = booking.finished_at or _now()
        if payload.status == "cancelled" and booking.cancelled_by is None:
            booking.cancelled_by = "driver"
        _release_holder(db, booking.id)

    booking.status = payload.status
    db.commit()
    db.refresh(booking)
    return _booking_out(booking, _driver_names(db))


@app.delete(
    "/api/bookings/{booking_id}",
    status_code=204,
    dependencies=[Depends(require_admin)],
)
def delete_booking(booking_id: int, db: Session = Depends(get_db)) -> None:
    """Remove a job outright.

    Deliberately a real delete rather than a status: a driver clearing a
    duplicate or a test entry wants it gone from the list, not lingering as
    another row to scroll past. Cancelling a genuine job is what the
    "cancelled" status is for, and that keeps the record.

    Frees the truck if this was the job in hand, so deleting the thing you were
    driving to does not leave you marked busy for the next half hour.
    """
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    _release_holder(db, booking.id)
    db.delete(booking)
    db.commit()


# ── Customer tracking ───────────────────────────────────────────────────────
# The "where's my driver" page. Keyed by the booking's own token: nobody can
# enumerate bookings, and the token is only ever shown to the person who made
# the booking and to the operator.


def _booking_by_token(db: Session, token: str) -> models.Booking:
    booking = db.scalars(
        select(models.Booking).where(models.Booking.track_token == token)
    ).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _track_out(db: Session, b: models.Booking) -> schemas.TrackOut:
    driver = db.get(models.Driver, b.driver_id) if b.driver_id is not None else None
    on_duty = _drivers_on_duty(db)

    eta: int | None = None
    source = "fallback"
    if b.status == "pending":
        if b.timing == "now":
            live, _queue = best_eta(db, b.pickup_lat, b.pickup_lng)
            if live is not None:
                eta, source = live, "driver"
            else:
                eta = measured_response_minutes(db) or _seed_avg_response(db)
    elif b.status in ("accepted", "en_route") and driver is not None:
        if (
            driver.lat is not None
            and driver.lng is not None
            and b.pickup_lat is not None
            and b.pickup_lng is not None
            and position_is_fresh(driver.located_at)
        ):
            travel = drive_minutes(driver.lat, driver.lng, b.pickup_lat, b.pickup_lng)
            if travel is not None:
                eta, source = travel, "driver"
    elif b.status == "on_scene":
        eta, source = 0, "driver"

    driver_out: schemas.TrackDriver | None = None
    if driver is not None and b.status in (*ACTIVE_STATUSES, "complete"):
        # The truck's live position is the customer's to see only while it is
        # actually coming to them. Before that it is somebody else's job; after
        # it is nobody's business.
        show_position = b.status == "en_route" and position_is_fresh(driver.located_at)
        driver_out = schemas.TrackDriver(
            name=driver.name,
            phone=driver.phone,
            lat=driver.lat if show_position else None,
            lng=driver.lng if show_position else None,
            locatedAt=_iso(driver.located_at) if show_position else None,
        )

    return schemas.TrackOut(
        id=b.id,
        status=b.status,  # type: ignore[arg-type]
        service=b.service,
        timing=b.timing,
        scheduledFor=b.scheduled_for,
        location=b.location,
        destination=b.destination,
        vehicle=b.vehicle,
        pickupLat=b.pickup_lat,
        pickupLng=b.pickup_lng,
        price=b.price,
        motorway=b.motorway,
        etaMinutes=eta,
        etaSource=source,  # type: ignore[arg-type]
        driversOnDuty=on_duty,
        driver=driver_out,
        createdAt=_iso(b.created_at) or "",
        acceptedAt=_iso(b.accepted_at),
        enRouteAt=_iso(b.en_route_at),
        onSceneAt=_iso(b.on_scene_at),
        finishedAt=_iso(b.finished_at),
        cancelledBy=b.cancelled_by,
        rating=b.rating,
        canCancel=b.status in ("pending", "accepted", "en_route"),
    )


@app.get("/api/track/{token}", response_model=schemas.TrackOut)
def track_booking(token: str, db: Session = Depends(get_db)) -> schemas.TrackOut:
    return _track_out(db, _booking_by_token(db, token))


@app.post("/api/track/{token}/cancel", response_model=schemas.TrackOut)
def cancel_booking(token: str, db: Session = Depends(get_db)) -> schemas.TrackOut:
    """The customer calling it off. Allowed right up until the truck is on
    scene: once the driver is stood next to the car the callout has been done."""
    booking = _booking_by_token(db, token)
    if booking.status not in ("pending", "accepted", "en_route"):
        raise HTTPException(status_code=409, detail="This booking can no longer be cancelled")
    booking.status = "cancelled"
    booking.cancelled_by = "customer"
    booking.finished_at = _now()
    _release_holder(db, booking.id)
    db.commit()
    db.refresh(booking)
    return _track_out(db, booking)


@app.post("/api/track/{token}/rating", response_model=schemas.TrackOut)
def rate_booking(
    token: str, payload: schemas.RatingIn, db: Session = Depends(get_db)
) -> schemas.TrackOut:
    booking = _booking_by_token(db, token)
    if booking.status != "complete":
        raise HTTPException(status_code=409, detail="A job can be rated once it is done")
    booking.rating = payload.rating
    booking.rating_comment = (payload.comment or "").strip() or None
    db.commit()
    db.refresh(booking)
    return _track_out(db, booking)


# ── Telemetry ───────────────────────────────────────────────────────────────

# The booking funnel, in order. Names are what the client sends; labels are
# what the operator reads. Kept here rather than in the client so the
# dashboard's shape does not depend on a deployed browser agreeing with it.
FUNNEL = [
    ("page_view", "Landed on the site"),
    ("booking_started", "Typed a pickup"),
    ("details_done", "Gave a phone number"),
    ("service_chosen", "Chose a service"),
    ("quote_shown", "Saw a price"),
    ("dispatch_requested", "Pressed dispatch"),
    ("booking_confirmed", "Booking confirmed"),
]


@app.post("/api/events", status_code=204)
def record_events(batch: schemas.EventBatch, db: Session = Depends(get_db)) -> None:
    """Swallow a batch of anonymous events.

    Returns 204 whatever happens short of a malformed body: analytics must
    never be the reason a customer's browser reports an error, and a dropped
    event costs a row in a chart.
    """
    db.add_all(
        models.Event(
            name=e.name[:40],
            session_id=e.sessionId[:40],
            path=e.path[:120],
            region=e.region,
            device=e.device,
            referrer=e.referrer,
            payload=e.payload,
        )
        for e in batch.events
    )
    db.commit()


def _rows(db: Session, query) -> list[schemas.CountRow]:
    return [schemas.CountRow(label=str(label), count=int(count)) for label, count in db.execute(query)]


@app.get(
    "/api/admin/telemetry",
    response_model=schemas.TelemetryOut,
    dependencies=[Depends(require_admin)],
)
def telemetry(days: int = 30, db: Session = Depends(get_db)) -> schemas.TelemetryOut:
    days = max(1, min(365, days))
    since = _now() - timedelta(days=days)
    E = models.Event
    recent = E.created_at >= since

    sessions = db.scalar(select(func.count(func.distinct(E.session_id))).where(recent)) or 0
    events = db.scalar(select(func.count()).select_from(E).where(recent)) or 0

    # Funnel counted in sessions, not events: a customer who edits their
    # pickup five times is one person getting to that step, not five.
    per_step = dict(
        db.execute(
            select(E.name, func.count(func.distinct(E.session_id)))
            .where(recent)
            .group_by(E.name)
        ).all()
    )
    entry = per_step.get("page_view", 0) or 0
    funnel = [
        schemas.FunnelStep(
            name=name,
            label=label,
            sessions=int(per_step.get(name, 0) or 0),
            pctOfEntry=round(100 * (per_step.get(name, 0) or 0) / entry, 1) if entry else 0.0,
        )
        for name, label in FUNNEL
    ]

    top_regions = _rows(
        db,
        select(E.region, func.count(func.distinct(E.session_id)))
        .where(recent, E.region.is_not(None))
        .group_by(E.region)
        .order_by(func.count(func.distinct(E.session_id)).desc())
        .limit(12),
    )
    devices = _rows(
        db,
        select(E.device, func.count(func.distinct(E.session_id)))
        .where(recent, E.device.is_not(None))
        .group_by(E.device)
        .order_by(func.count(func.distinct(E.session_id)).desc()),
    )
    referrers = _rows(
        db,
        select(E.referrer, func.count(func.distinct(E.session_id)))
        .where(recent, E.referrer.is_not(None))
        .group_by(E.referrer)
        .order_by(func.count(func.distinct(E.session_id)).desc())
        .limit(10),
    )
    daily = _rows(
        db,
        select(func.date(E.created_at), func.count(func.distinct(E.session_id)))
        .where(recent)
        .group_by(func.date(E.created_at))
        .order_by(func.date(E.created_at)),
    )

    call_clicks = (
        db.scalar(select(func.count()).select_from(E).where(recent, E.name == "call_clicked")) or 0
    )

    # Quotes: what people are actually being shown, and what it was worth.
    quote_rows = db.execute(
        select(E.payload).where(recent, E.name == "quote_shown")
    ).scalars().all()
    prices = [
        p["price"]
        for p in quote_rows
        if isinstance(p, dict) and isinstance(p.get("price"), (int, float))
    ]
    service_counts: dict[str, int] = {}
    availability: dict[str, int] = {}
    for p in quote_rows:
        if not isinstance(p, dict):
            continue
        if isinstance(p.get("service"), str):
            service_counts[p["service"]] = service_counts.get(p["service"], 0) + 1
        # Whether anyone was on duty when the price was shown — the question
        # behind "does having a driver on actually win work?"
        key = "driver on duty" if p.get("driverAvailable") else "nobody on duty"
        availability[key] = availability.get(key, 0) + 1

    bookings = db.scalar(select(func.count()).select_from(models.Booking).where(
        models.Booking.created_at >= since
    )) or 0

    to_rows = lambda d: [  # noqa: E731
        schemas.CountRow(label=k, count=v)
        for k, v in sorted(d.items(), key=lambda kv: -kv[1])
    ]

    return schemas.TelemetryOut(
        days=days,
        sessions=int(sessions),
        events=int(events),
        bookings=int(bookings),
        callClicks=int(call_clicks),
        funnel=funnel,
        topRegions=top_regions,
        services=to_rows(service_counts),
        devices=devices,
        referrers=referrers,
        daily=daily,
        quotesShown=len(quote_rows),
        avgQuote=round(sum(prices) / len(prices), 2) if prices else None,
        availabilityAtQuote=to_rows(availability),
    )
