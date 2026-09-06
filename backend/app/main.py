from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas
from .config import settings
from .db import get_db
from .notify import BookingDetails, send_booking_notification

app = FastAPI(title="Recovery Mayte API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "OPTIONS"],
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

    # Idempotency: a retry with the same requestId returns the original booking
    # (and does not re-notify).
    existing = db.scalars(
        select(models.Booking).where(models.Booking.request_id == payload.requestId)
    ).first()
    if existing is not None:
        return schemas.BookingCreated(bookingId=existing.id, eta=eta)

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
        return schemas.BookingCreated(bookingId=existing.id, eta=eta)

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

    return schemas.BookingCreated(bookingId=booking.id, eta=eta)


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
        schemas.BookingOut(
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
            status=b.status,
            createdAt=b.created_at.isoformat(),
        )
        for b in rows
    ]
