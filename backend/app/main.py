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

app = FastAPI(title="Recovery Mayte API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # DELETE is here for the driver console clearing a job. Listed explicitly
    # rather than "*" so adding a destructive method stays a deliberate act.
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Shown before any metrics row exists (also the seed values).
DEFAULT_METRICS = {"rescuesToday": 148, "driversAvailable": 7, "avgResponseMinutes": 24}


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/metrics", response_model=schemas.MetricsOut)
def get_metrics(db: Session = Depends(get_db)) -> schemas.MetricsOut:
    metric = db.scalars(select(models.Metric)).first()
    if metric is None:
        return schemas.MetricsOut(**DEFAULT_METRICS)
    return schemas.MetricsOut(
        rescuesToday=metric.rescues_today,
        driversAvailable=metric.drivers_available,
        avgResponseMinutes=metric.avg_response_minutes,
    )


@app.post("/api/bookings", response_model=schemas.BookingCreated, status_code=201)
def create_booking(
    payload: schemas.BookingCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> schemas.BookingCreated:
    metric = db.scalars(select(models.Metric)).first()
    eta = metric.avg_response_minutes if metric else DEFAULT_METRICS["avgResponseMinutes"]

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
        return schemas.BookingCreated(bookingId=existing.id, eta=eta, etaSource=eta_source)

    booking = models.Booking(
        request_id=payload.requestId,
        region=payload.region,
        location=payload.location,
        destination=payload.destination,
        phone=payload.phone,
        service=payload.service,
        timing=payload.timing,
        scheduled_for=payload.scheduledFor,
        pickup_lat=payload.pickupLat,
        pickup_lng=payload.pickupLng,
        motorway=payload.motorway,
        distance_miles=payload.distanceMiles,
        duration_minutes=payload.durationMinutes,
        price=payload.price,
        status="pending",
    )
    db.add(booking)
    if metric is not None:
        metric.rescues_today += 1

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
        return schemas.BookingCreated(bookingId=existing.id, eta=eta, etaSource=eta_source)

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
        "pickup_lat": booking.pickup_lat,
        "pickup_lng": booking.pickup_lng,
        "motorway": booking.motorway,
        "distance_miles": booking.distance_miles,
        "duration_minutes": booking.duration_minutes,
        "price": booking.price,
    }
    background.add_task(send_booking_notification, details)

    return schemas.BookingCreated(bookingId=booking.id, eta=eta, etaSource=eta_source)


def require_admin(x_api_key: str = Header(default="")) -> None:
    if x_api_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get(
    "/api/bookings",
    response_model=list[schemas.BookingOut],
    dependencies=[Depends(require_admin)],
)
def list_bookings(limit: int = 50, db: Session = Depends(get_db)) -> list[schemas.BookingOut]:
    rows = db.scalars(
        select(models.Booking).order_by(models.Booking.created_at.desc()).limit(min(limit, 200))
    ).all()
    return [
        _booking_out(b)
        for b in rows
    ]


def _booking_out(b: models.Booking) -> schemas.BookingOut:
    return schemas.BookingOut(
        id=b.id,
        region=b.region,
        location=b.location,
        destination=b.destination,
        phone=b.phone,
        service=b.service,
        timing=b.timing,
        scheduledFor=b.scheduled_for,
        pickupLat=b.pickup_lat,
        pickupLng=b.pickup_lng,
        motorway=b.motorway,
        distanceMiles=b.distance_miles,
        durationMinutes=b.duration_minutes,
        price=b.price,
        driverId=b.driver_id,
        status=b.status,
        createdAt=b.created_at.isoformat(),
    )


# -- Drivers -----------------------------------------------------------------


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


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


@app.get("/api/eta", response_model=schemas.EtaOut)
def get_eta(lat: float, lng: float, db: Session = Depends(get_db)) -> schemas.EtaOut:
    """Public. Answers in minutes and never discloses where any driver is."""
    minutes, queue = best_eta(db, lat, lng)
    on_duty = db.scalar(
        select(func.count())
        .select_from(models.Driver)
        .where(models.Driver.active, models.Driver.available)
    )
    if minutes is None:
        metric = db.scalars(select(models.Metric)).first()
        fallback = metric.avg_response_minutes if metric else DEFAULT_METRICS["avgResponseMinutes"]
        return schemas.EtaOut(
            driversOnDuty=on_duty or 0,
            etaMinutes=fallback,
            queueMinutes=0,
            source="fallback",
        )
    return schemas.EtaOut(
        driversOnDuty=on_duty or 0,
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
        driver.located_at = datetime.now(timezone.utc)
    if payload.busyMinutes is not None:
        # The driver's own read on when they will be free beats the estimate
        # made when they took the job. Zero means done — free right now.
        driver.busy_until = (
            datetime.now(timezone.utc) + timedelta(minutes=payload.busyMinutes)
            if payload.busyMinutes > 0
            else None
        )
    db.commit()
    db.refresh(driver)
    return _driver_out(driver)


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

    booking.status = payload.status
    driver = _get_driver(db, payload.driverId) if payload.driverId is not None else None

    if payload.status in ("accepted", "en_route", "on_scene"):
        if driver is None:
            raise HTTPException(status_code=400, detail="A driver must be given to take a job")
        booking.driver_id = driver.id
        driver.current_booking_id = booking.id
        # When the truck comes free, so anyone booking behind this customer is
        # quoted the queue as well as the drive.
        travel = 0
        if driver.lat is not None and booking.pickup_lat is not None:
            travel = (
                drive_minutes(driver.lat, driver.lng, booking.pickup_lat, booking.pickup_lng)
                or 0
            )
        remaining = estimate_finish_minutes(travel, booking.duration_minutes)
        driver.busy_until = datetime.now(timezone.utc) + timedelta(minutes=remaining)
    elif payload.status in ("complete", "cancelled"):
        holder = db.scalars(
            select(models.Driver).where(models.Driver.current_booking_id == booking.id)
        ).first()
        if holder is not None:
            holder.current_booking_id = None
            holder.busy_until = None

    db.commit()
    db.refresh(booking)
    return _booking_out(booking)


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

    holder = db.scalars(
        select(models.Driver).where(models.Driver.current_booking_id == booking.id)
    ).first()
    if holder is not None:
        holder.current_booking_id = None
        holder.busy_until = None

    db.delete(booking)
    db.commit()
