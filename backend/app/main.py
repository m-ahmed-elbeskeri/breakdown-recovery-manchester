import re
import secrets
from datetime import date, timedelta

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import audit, models, schemas
from .admin import router as admin_router
from .analytics import BOOKING_FUNNEL as FUNNEL
from .analytics import router as analytics_router
from .auth import require_admin, revoke_sessions
from .auth import router as auth_router
from .config import settings
from .db import get_db
from .dispatch import (  # noqa: F401  (MIN_MEASURED_JOBS is imported by tests)
    ACTIVE_STATUSES,
    MIN_MEASURED_JOBS,
    apply_state,
    best_eta,
    check_can_go_on_duty,
    drivers_on_duty,
    measured_response_minutes,
    release_driver_jobs,
    release_holder,
    seed_avg_response,
    set_job_status,
)
from .documents import file_response
from .drivers import router as drivers_router
from .eta import drive_minutes, position_is_fresh
from .notify import BookingDetails, send_booking_notification
from .serialize import booking_out, driver_names, driver_out
from .timeutil import iso, now

app = FastAPI(title="Car Recovery Near Me API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Listed explicitly rather than "*" so adding a destructive method stays a
    # deliberate act.
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(drivers_router)
app.include_router(admin_router)
app.include_router(analytics_router)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/metrics", response_model=schemas.MetricsOut)
def get_metrics(db: Session = Depends(get_db)) -> schemas.MetricsOut:
    """The dispatch panel's figures, all of them real."""
    since = now() - timedelta(hours=24)
    rescues = db.scalar(
        select(func.count())
        .select_from(models.Booking)
        .where(models.Booking.created_at >= since, models.Booking.status != "cancelled")
    )
    measured = measured_response_minutes(db)
    return schemas.MetricsOut(
        rescuesToday=int(rescues or 0),
        driversAvailable=drivers_on_duty(db),
        avgResponseMinutes=measured if measured is not None else seed_avg_response(db),
        measured=measured is not None,
    )


# ── Bookings ────────────────────────────────────────────────────────────────


@app.post("/api/bookings", response_model=schemas.BookingCreated, status_code=201)
def create_booking(
    payload: schemas.BookingCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> schemas.BookingCreated:
    eta = measured_response_minutes(db) or seed_avg_response(db)
    live, _queue = best_eta(db, payload.pickupLat, payload.pickupLng)
    eta_source = "fallback"
    if live is not None:
        eta = live
        eta_source = "driver"

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


@app.get("/api/bookings", response_model=list[schemas.BookingOut])
def list_bookings(
    limit: int = 50,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[schemas.BookingOut]:
    rows = db.scalars(
        select(models.Booking).order_by(models.Booking.created_at.desc()).limit(min(limit, 200))
    ).all()
    names = driver_names(db)
    return [booking_out(b, names) for b in rows]


@app.post("/api/bookings/{booking_id}/status", response_model=schemas.BookingOut)
def set_booking_status(
    booking_id: int,
    payload: schemas.BookingStatusIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> schemas.BookingOut:
    """The office moving a job along or assigning it to a driver."""
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    driver = None
    if payload.driverId is not None:
        driver = db.get(models.Driver, payload.driverId)
        if driver is None or not driver.active:
            raise HTTPException(status_code=404, detail="Driver not found")
    set_job_status(db, booking, payload.status, driver=driver, actor=admin, by_admin=True)
    db.commit()
    db.refresh(booking)
    return booking_out(booking, driver_names(db))


@app.delete("/api/bookings/{booking_id}", status_code=204)
def delete_booking(
    booking_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a job outright, e.g. a duplicate or a test. Frees the truck."""
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    release_holder(db, booking.id)
    audit.record(db, admin, "job.deleted", target_type="booking", target_id=booking.id)
    db.delete(booking)
    db.commit()


# ── The roster ──────────────────────────────────────────────────────────────


@app.get("/api/drivers", response_model=list[schemas.DriverOut])
def list_drivers(
    admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[schemas.DriverOut]:
    rows = db.scalars(
        select(models.Driver).where(models.Driver.active).order_by(models.Driver.id)
    ).all()
    return [driver_out(d) for d in rows]


@app.delete("/api/drivers/{driver_id}", status_code=204)
def retire_driver(
    driver_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Take a driver off the roster. Their past jobs still name them, their
    documents are kept, and they can no longer sign in."""
    driver = db.get(models.Driver, driver_id)
    if driver is None or not driver.active:
        raise HTTPException(status_code=404, detail="Driver not found")
    release_driver_jobs(db, driver, admin)
    driver.active = False
    driver.available = False
    driver.current_booking_id = None
    driver.busy_until = None
    if driver.user_id:
        user = db.get(models.User, driver.user_id)
        if user is not None:
            user.is_active = False
        revoke_sessions(db, driver.user_id)
    audit.record(db, admin, "driver.removed", target_type="driver", target_id=driver.id)
    db.commit()


@app.post("/api/drivers/{driver_id}/state", response_model=schemas.DriverOut)
def set_driver_state(
    driver_id: int,
    payload: schemas.DriverStateIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> schemas.DriverOut:
    driver = db.get(models.Driver, driver_id)
    if driver is None or not driver.active:
        raise HTTPException(status_code=404, detail="Driver not found")
    if payload.available is True and not driver.available:
        check_can_go_on_duty(db, driver, who=driver.name)
    apply_state(driver, payload, position_when_off_duty=True)
    db.commit()
    db.refresh(driver)
    return driver_out(driver)


@app.get("/api/eta", response_model=schemas.EtaOut)
def get_eta(lat: float, lng: float, db: Session = Depends(get_db)) -> schemas.EtaOut:
    """Public. Answers in minutes and never discloses where any driver is."""
    minutes, queue = best_eta(db, lat, lng)
    on_duty = drivers_on_duty(db)
    if minutes is None:
        return schemas.EtaOut(
            driversOnDuty=on_duty,
            etaMinutes=measured_response_minutes(db) or seed_avg_response(db),
            queueMinutes=0,
            source="fallback",
        )
    return schemas.EtaOut(driversOnDuty=on_duty, etaMinutes=minutes, queueMinutes=queue, source="driver")


# ── Customer tracking ───────────────────────────────────────────────────────


def _booking_by_token(db: Session, token: str) -> models.Booking:
    booking = db.scalars(select(models.Booking).where(models.Booking.track_token == token)).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _approved_photo(db: Session, driver_id: int) -> models.DriverDocument | None:
    return db.scalars(
        select(models.DriverDocument)
        .where(
            models.DriverDocument.driver_id == driver_id,
            models.DriverDocument.doc_type == "profile_photo",
            models.DriverDocument.status == "approved",
            models.DriverDocument.superseded.is_(False),
        )
        .order_by(models.DriverDocument.id.desc())
    ).first()


def _track_out(db: Session, b: models.Booking) -> schemas.TrackOut:
    driver = db.get(models.Driver, b.driver_id) if b.driver_id is not None else None
    on_duty = drivers_on_duty(db)

    eta: int | None = None
    source = "fallback"
    if b.status == "pending":
        if b.timing == "now":
            live, _queue = best_eta(db, b.pickup_lat, b.pickup_lng)
            if live is not None:
                eta, source = live, "driver"
            else:
                eta = measured_response_minutes(db) or seed_avg_response(db)
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

    driver_view: schemas.TrackDriver | None = None
    if driver is not None and b.status in (*ACTIVE_STATUSES, "complete"):
        # The truck's position is the customer's to see only while it is
        # actually coming to them.
        show_position = b.status == "en_route" and position_is_fresh(driver.located_at)
        driver_view = schemas.TrackDriver(
            name=driver.name,
            phone=driver.phone,
            lat=driver.lat if show_position else None,
            lng=driver.lng if show_position else None,
            locatedAt=iso(driver.located_at) if show_position else None,
            vehicleReg=driver.vehicle_reg,
            vehicleDescription=driver.vehicle_make_model,
            hasPhoto=_approved_photo(db, driver.id) is not None,
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
        driver=driver_view,
        createdAt=iso(b.created_at) or "",
        acceptedAt=iso(b.accepted_at),
        enRouteAt=iso(b.en_route_at),
        onSceneAt=iso(b.on_scene_at),
        finishedAt=iso(b.finished_at),
        cancelledBy=b.cancelled_by,
        rating=b.rating,
        canCancel=b.status in ("pending", "accepted", "en_route"),
    )


@app.get("/api/track/{token}", response_model=schemas.TrackOut)
def track_booking(token: str, db: Session = Depends(get_db)) -> schemas.TrackOut:
    return _track_out(db, _booking_by_token(db, token))


@app.get("/api/track/{token}/driver-photo")
def track_driver_photo(token: str, db: Session = Depends(get_db)) -> Response:
    """The approved photo of the driver on this job, so the customer knows who to expect."""
    booking = _booking_by_token(db, token)
    if booking.driver_id is None or booking.status not in (*ACTIVE_STATUSES, "complete"):
        raise HTTPException(status_code=404, detail="No driver on this job")
    photo = _approved_photo(db, booking.driver_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="No photo")
    return file_response(db, photo)


@app.post("/api/track/{token}/cancel", response_model=schemas.TrackOut)
def cancel_booking(token: str, db: Session = Depends(get_db)) -> schemas.TrackOut:
    booking = _booking_by_token(db, token)
    if booking.status not in ("pending", "accepted", "en_route"):
        raise HTTPException(status_code=409, detail="This booking can no longer be cancelled")
    booking.status = "cancelled"
    booking.cancelled_by = "customer"
    booking.finished_at = now()
    release_holder(db, booking.id)
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

# Only the events the site actually sends. Anything else posted here is noise.
ALLOWED_EVENTS = frozenset(
    {
        "page_view", "page_engagement", "link_clicked", "cta_clicked", "outbound_clicked",
        "email_clicked", "call_clicked", "faq_opened", "booking_started", "details_done",
        "service_chosen", "quote_shown", "dispatch_requested", "booking_confirmed", "form_error",
        "find_me_used", "track_viewed", "track_cancelled", "track_rated", "install_prompted",
        "vitals", "js_error",
    }
)
# Search engines, link previews, speed testers, monitors and scripts. The site
# skips these itself; this catches anything that posts directly.
BOT_AGENT = re.compile(
    r"bot\b|bot/|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|"
    r"facebookexternalhit|embedly|preview|curl/|wget/|python-requests|go-http-client",
    re.IGNORECASE,
)
REFERRER_HOST = re.compile(r"[a-z0-9.-]{1,120}")
REGION_NAME = re.compile(r"[A-Za-z' .-]{1,60}")
DEVICES = frozenset({"mobile", "tablet", "desktop"})
# One browser tab cannot plausibly do more than this in a day.
MAX_EVENTS_PER_SESSION_DAY = 2000
# Staff and drivers' signed-in pages. The site never sends these; if anything
# does, they are not stored.
PRIVATE_PATH = re.compile(r"^/(admin|driver|login|forgot-password|reset-password)(/|$)")
# Analytics are kept for 13 months, then deleted.
EVENT_RETENTION_DAYS = 395
_last_purge: date | None = None


def _event_path(path: str) -> str:
    """Only the path, and never a tracking link's token: that token opens somebody's booking."""
    path = path.split("?", 1)[0].split("#", 1)[0] or "/"
    return "/track" if path.startswith("/track/") else path[:120]


def _event_payload(payload: dict | None) -> dict | None:
    """Short labels, numbers and yes/no only. Nothing that could be somebody's words."""
    if not isinstance(payload, dict):
        return None
    kept: dict = {}
    for key, value in list(payload.items())[:16]:
        if not isinstance(key, str) or len(key) > 30:
            continue
        if value is None or isinstance(value, (bool, int, float)):
            kept[key] = value
        elif isinstance(value, str) and len(value) <= 60:
            kept[key] = value
    return kept or None


MAX_EVENT_BODY_BYTES = 64_000


@app.post("/api/events", status_code=204)
async def record_events(request: Request, db: Session = Depends(get_db)) -> None:
    """Anonymous events from the site.

    Read from the raw body rather than as a JSON-typed request: the site sends
    text/plain so the browser can post straight to this other domain without a
    preflight, which a beacon sent as a page closes has no time to wait for.
    """
    body = await request.body()
    if len(body) > MAX_EVENT_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Too many events at once.")
    if BOT_AGENT.search(request.headers.get("user-agent", "")):
        return
    try:
        batch = schemas.EventBatch.model_validate_json(body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Events were not in the expected shape.") from exc
    await run_in_threadpool(_store_events, db, batch)


def _store_events(db: Session, batch: schemas.EventBatch) -> None:
    global _last_purge
    kept = []
    counted: dict[str, int] = {}
    day_ago = now() - timedelta(days=1)
    for e in batch.events:
        path = _event_path(e.path)
        if e.name not in ALLOWED_EVENTS or PRIVATE_PATH.match(path):
            continue
        session = e.sessionId[:40]
        if session != "anonymous":
            if session not in counted:
                counted[session] = db.scalar(
                    select(func.count())
                    .select_from(models.Event)
                    .where(models.Event.session_id == session, models.Event.created_at >= day_ago)
                ) or 0
            if counted[session] >= MAX_EVENTS_PER_SESSION_DAY:
                continue
            counted[session] += 1
        kept.append(
            models.Event(
                name=e.name,
                session_id=session,
                path=path,
                region=e.region if e.region and REGION_NAME.fullmatch(e.region) else None,
                device=e.device if e.device in DEVICES else None,
                referrer=e.referrer if e.referrer and REFERRER_HOST.fullmatch(e.referrer) else None,
                payload=_event_payload(e.payload),
            )
        )
    db.add_all(kept)
    today = now().date()
    if _last_purge != today:
        _last_purge = today
        db.execute(
            delete(models.Event).where(
                models.Event.created_at < now() - timedelta(days=EVENT_RETENTION_DAYS)
            )
        )
    db.commit()


def _rows(db: Session, query) -> list[schemas.CountRow]:
    return [schemas.CountRow(label=str(label), count=int(count)) for label, count in db.execute(query)]


@app.get("/api/admin/telemetry", response_model=schemas.TelemetryOut)
def telemetry(
    days: int = 30,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> schemas.TelemetryOut:
    days = max(1, min(365, days))
    since = now() - timedelta(days=days)
    E = models.Event
    recent = E.created_at >= since

    sessions = db.scalar(select(func.count(func.distinct(E.session_id))).where(recent)) or 0
    events = db.scalar(select(func.count()).select_from(E).where(recent)) or 0

    per_step = dict(
        db.execute(
            select(E.name, func.count(func.distinct(E.session_id))).where(recent).group_by(E.name)
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

    def distinct_sessions():
        return func.count(func.distinct(E.session_id))

    top_regions = _rows(
        db,
        select(E.region, distinct_sessions())
        .where(recent, E.region.is_not(None))
        .group_by(E.region)
        .order_by(distinct_sessions().desc())
        .limit(12),
    )
    devices = _rows(
        db,
        select(E.device, distinct_sessions())
        .where(recent, E.device.is_not(None))
        .group_by(E.device)
        .order_by(distinct_sessions().desc()),
    )
    referrers = _rows(
        db,
        select(E.referrer, distinct_sessions())
        .where(recent, E.referrer.is_not(None))
        .group_by(E.referrer)
        .order_by(distinct_sessions().desc())
        .limit(10),
    )
    daily = _rows(
        db,
        select(func.date(E.created_at), distinct_sessions())
        .where(recent)
        .group_by(func.date(E.created_at))
        .order_by(func.date(E.created_at)),
    )
    call_clicks = (
        db.scalar(select(func.count()).select_from(E).where(recent, E.name == "call_clicked")) or 0
    )

    quote_rows = db.execute(select(E.payload).where(recent, E.name == "quote_shown")).scalars().all()
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
        key = "driver on duty" if p.get("driverAvailable") else "nobody on duty"
        availability[key] = availability.get(key, 0) + 1

    bookings = db.scalar(
        select(func.count()).select_from(models.Booking).where(models.Booking.created_at >= since)
    ) or 0

    def to_rows(counts: dict[str, int]) -> list[schemas.CountRow]:
        return [
            schemas.CountRow(label=k, count=v)
            for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
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
