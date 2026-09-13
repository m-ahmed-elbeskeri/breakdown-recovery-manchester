"""Who can be sent to a job, and what happens when a job changes hands.

Shared by the admin endpoints and the driver console so the two can never
disagree about the rules: a driver whose insurance has lapsed cannot take a
job whether they tap "Take this job" themselves or the office assigns it.
"""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import audit, models, schemas
from .compliance import Compliance, evaluate
from .eta import drive_minutes, estimate_finish_minutes, minutes_until, position_is_fresh
from .timeutil import aware, now, today_uk

DEFAULT_AVG_RESPONSE_MINUTES = 24
# How many real, timed callouts it takes before the site quotes the measured
# figure instead of the seeded one.
MIN_MEASURED_JOBS = 5
MEASURED_WINDOW_DAYS = 30

ACTIVE_STATUSES = ("accepted", "en_route", "on_scene")
FINISHED_STATUSES = ("complete", "cancelled")
ORDER = ["pending", "accepted", "en_route", "on_scene", "complete"]


def blocked(status_code: int, message: str, blockers: list[str]) -> HTTPException:
    """An error the screen can show as a heading and a list of what to fix."""
    return HTTPException(status_code=status_code, detail={"message": message, "blockers": blockers})


# ── Response time ───────────────────────────────────────────────────────────


def seed_avg_response(db: Session) -> int:
    metric = db.scalars(select(models.Metric)).first()
    return metric.avg_response_minutes if metric else DEFAULT_AVG_RESPONSE_MINUTES


def measured_response_minutes(db: Session) -> int | None:
    """The real average from booking to driver on scene, or None until there
    are enough timed jobs to say. Scheduled collections are excluded."""
    since = now() - timedelta(days=MEASURED_WINDOW_DAYS)
    rows = db.scalars(
        select(models.Booking).where(
            models.Booking.timing == "now",
            models.Booking.on_scene_at.is_not(None),
            models.Booking.created_at >= since,
        )
    ).all()
    samples = [
        (aware(b.on_scene_at) - aware(b.created_at)).total_seconds() / 60
        for b in rows
        if b.on_scene_at and b.created_at
    ]
    samples = [s for s in samples if 0 < s < 24 * 60]
    if len(samples) < MIN_MEASURED_JOBS:
        return None
    return max(1, round(sum(samples) / len(samples)))


# ── Who is on the road ──────────────────────────────────────────────────────


def _on_duty_filter():
    return (
        models.Driver.active,
        models.Driver.available,
        models.Driver.application_status == "active",
    )


def drivers_on_duty(db: Session) -> int:
    return int(
        db.scalar(select(func.count()).select_from(models.Driver).where(*_on_duty_filter())) or 0
    )


def best_eta(db: Session, lat: float | None, lng: float | None) -> tuple[int | None, int]:
    """Minutes until the soonest driver could reach (lat, lng), and their queue."""
    if lat is None or lng is None:
        return None, 0
    best: tuple[int, int] | None = None
    for d in db.scalars(select(models.Driver).where(*_on_duty_filter())).all():
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


def compliance_for(db: Session, driver: models.Driver) -> Compliance:
    docs = db.scalars(
        select(models.DriverDocument).where(models.DriverDocument.driver_id == driver.id)
    ).all()
    return evaluate(driver, list(docs), today_uk())


def apply_state(
    driver: models.Driver, payload: schemas.DriverStateIn, *, position_when_off_duty: bool
) -> None:
    if payload.available is not None:
        driver.available = payload.available
    if payload.lat is not None and payload.lng is not None:
        # A driver who is not working is not being tracked, whatever their
        # phone sends.
        if driver.available or position_when_off_duty:
            driver.lat, driver.lng = payload.lat, payload.lng
            driver.located_at = now()
    if payload.busyMinutes is not None:
        driver.busy_until = (
            now() + timedelta(minutes=payload.busyMinutes) if payload.busyMinutes > 0 else None
        )


def check_can_go_on_duty(db: Session, driver: models.Driver, *, who: str) -> None:
    result = compliance_for(db, driver)
    if result.work_blockers:
        raise blocked(409, f"{who} can't go on duty yet.", result.work_blockers)


# ── Jobs changing hands ─────────────────────────────────────────────────────


def release_holder(db: Session, booking_id: int) -> None:
    """Free whichever truck had this job in hand."""
    holder = db.scalars(
        select(models.Driver).where(models.Driver.current_booking_id == booking_id)
    ).first()
    if holder is not None:
        holder.current_booking_id = None
        holder.busy_until = None


def release_job(
    db: Session,
    booking: models.Booking,
    *,
    actor: models.User | None,
    driver: models.Driver | None,
    by_admin: bool,
) -> None:
    """Hand a job back to the queue for somebody else to take."""
    if booking.status not in ("accepted", "en_route"):
        raise HTTPException(
            status_code=409,
            detail="Only a job that hasn't reached the customer can be handed back.",
        )
    if not by_admin and (driver is None or booking.driver_id != driver.id):
        raise HTTPException(status_code=409, detail="That job isn't yours.")
    previous = booking.driver_id
    release_holder(db, booking.id)
    booking.driver_id = None
    booking.status = "pending"
    booking.accepted_at = None
    booking.en_route_at = None
    audit.record(
        db,
        actor,
        "job.released",
        target_type="booking",
        target_id=booking.id,
        detail={"driverId": previous},
    )


def release_driver_jobs(db: Session, driver: models.Driver, actor: models.User | None) -> None:
    """Hand back everything a driver has not reached yet, e.g. on suspension."""
    for booking in db.scalars(
        select(models.Booking).where(
            models.Booking.driver_id == driver.id,
            models.Booking.status.in_(("accepted", "en_route")),
        )
    ).all():
        release_job(db, booking, actor=actor, driver=driver, by_admin=True)


def set_job_status(
    db: Session,
    booking: models.Booking,
    status: str,
    *,
    driver: models.Driver | None,
    actor: models.User | None,
    by_admin: bool,
) -> None:
    if status == "pending":
        release_job(db, booking, actor=actor, driver=driver, by_admin=by_admin)
        return

    moment = now()
    if status in ACTIVE_STATUSES:
        if driver is None:
            raise HTTPException(status_code=400, detail="A driver must be given to take a job")
        if booking.status == "cancelled":
            raise HTTPException(status_code=409, detail="This job was cancelled")
        if booking.status == "complete":
            raise HTTPException(status_code=409, detail="This job is already finished")
        taking = booking.driver_id != driver.id
        if taking and booking.status in ACTIVE_STATUSES and booking.driver_id is not None:
            raise HTTPException(status_code=409, detail="Another driver already has this job")
        if not by_admin and not taking and ORDER.index(status) < ORDER.index(booking.status):
            raise HTTPException(status_code=409, detail="That job has already moved on.")

        if taking:
            who = "You" if not by_admin else driver.name
            result = compliance_for(db, driver)
            if result.work_blockers:
                raise blocked(409, f"{who} can't take jobs yet.", result.work_blockers)
            if booking.motorway and result.motorway_blockers:
                raise blocked(409, f"{who} can't take motorway jobs yet.", result.motorway_blockers)
            if not by_admin and booking.timing == "now":
                other = db.scalars(
                    select(models.Booking).where(
                        models.Booking.driver_id == driver.id,
                        models.Booking.status.in_(ACTIVE_STATUSES),
                        models.Booking.timing == "now",
                        models.Booking.id != booking.id,
                    )
                ).first()
                if other is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Finish job #{other.id} before taking another.",
                    )

        booking.driver_id = driver.id
        driver.current_booking_id = booking.id
        if booking.accepted_at is None:
            booking.accepted_at = moment
            # When the truck comes free, so anyone booking behind this customer
            # is quoted the queue as well as the drive.
            travel = 0
            if (
                driver.lat is not None
                and driver.lng is not None
                and booking.pickup_lat is not None
                and booking.pickup_lng is not None
            ):
                travel = (
                    drive_minutes(driver.lat, driver.lng, booking.pickup_lat, booking.pickup_lng)
                    or 0
                )
            remaining = estimate_finish_minutes(travel, booking.duration_minutes)
            driver.busy_until = moment + timedelta(minutes=remaining)
        if status in ("en_route", "on_scene"):
            booking.en_route_at = booking.en_route_at or moment
        if status == "on_scene":
            booking.on_scene_at = booking.on_scene_at or moment

    elif status in FINISHED_STATUSES:
        if not by_admin:
            if status == "cancelled":
                raise HTTPException(
                    status_code=403,
                    detail="Hand the job back instead, or ring the office to cancel it.",
                )
            if driver is None or booking.driver_id != driver.id or booking.status not in ACTIVE_STATUSES:
                raise HTTPException(status_code=409, detail="That job isn't yours to finish.")
        booking.finished_at = booking.finished_at or moment
        if status == "cancelled" and booking.cancelled_by is None:
            booking.cancelled_by = "office"
        release_holder(db, booking.id)

    booking.status = status
    audit.record(
        db,
        actor,
        f"job.{status}",
        target_type="booking",
        target_id=booking.id,
        detail={"driverId": booking.driver_id, "byAdmin": by_admin},
    )
