from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Client-generated idempotency key — makes booking submission safe to retry.
    request_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    region: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(Text)
    destination: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str] = mapped_column(String(40))
    service: Mapped[str] = mapped_column(String(40))
    timing: Mapped[str] = mapped_column(String(10))  # "now" | "later"
    scheduled_for: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # Where the customer actually is, resolved by the browser at booking time.
    # Kept alongside the free-text location because a driver needs a pin, not a
    # street name: "Church Street" is ambiguous, 53.4808/-2.2426 is not.
    pickup_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Live carriageway: changes the price, and changes how the crew approaches.
    motorway: Mapped[bool] = mapped_column(Boolean, default=False)

    distance_miles: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Which driver took it. Null while the job is still unclaimed.
    driver_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class Driver(Base):
    """A driver and where they are right now.

    A real table with real rows from the outset, even though the business runs
    one truck today. The whole model is a fleet that switches itself on and off:
    dispatch asks "who is free and nearest", which is the same question whether
    the answer comes from one row or forty. A singleton row would have been
    simpler this week and a migration with live jobs in it later.

    Coordinates here are a person's live location. No public endpoint returns
    them — /api/eta answers in minutes computed from them, and nothing else.
    """

    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # On duty and taking jobs. The driver's own switch, not dispatch's.
    available: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Off the roster entirely (left, suspended) — distinct from merely off duty.
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    located_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # The job in hand and when the truck comes free. `busy_until` is what makes
    # a queued customer's ETA honest: they are quoted the job in front of them
    # as well as the drive to their door.
    current_booking_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    busy_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Event(Base):
    """One thing that happened on the site.

    Deliberately anonymous. No phone number, no address, no name, no IP, no
    cookie — a session id generated per browser tab is enough to follow one
    visit through the funnel, and it dies with the tab. Under UK GDPR that
    keeps this out of consent-banner territory, and it costs nothing analytically:
    what the operator needs is which areas convert and where people give up,
    not who they are.

    `payload` is free-form per event type. Anything identifying is stripped
    client-side before it is sent; the schema will not accept a key it does not
    recognise either.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # e.g. "page_view", "quote_shown", "call_clicked", "dispatch_requested".
    name: Mapped[str] = mapped_column(String(40), index=True)
    session_id: Mapped[str] = mapped_column(String(40), index=True)

    # Where it happened. Region is the area page, which is the whole point of
    # 36 of them: it answers which ones are worth the SEO effort.
    path: Mapped[str] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)

    # How they arrived and on what. Coarse on purpose: "mobile" not a user
    # agent string, a referrer host not a full URL with its query string.
    device: Mapped[str | None] = mapped_column(String(20), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(120), nullable=True)

    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class Metric(Base):
    __tablename__ = "metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rescues_today: Mapped[int] = mapped_column(Integer, default=148)
    drivers_available: Mapped[int] = mapped_column(Integer, default=7)
    avg_response_minutes: Mapped[int] = mapped_column(Integer, default=24)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
