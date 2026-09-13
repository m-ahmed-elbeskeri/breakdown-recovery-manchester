from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Client-generated idempotency key — makes booking submission safe to retry.
    request_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # The customer's key to their own booking. Unguessable, handed back once at
    # booking time, and the only thing the public tracking page accepts. A
    # sequential id would let anyone read anyone's pickup and phone number.
    track_token: Mapped[str | None] = mapped_column(
        String(48), unique=True, index=True, nullable=True
    )

    region: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(Text)
    destination: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str] = mapped_column(String(40))
    service: Mapped[str] = mapped_column(String(40))
    timing: Mapped[str] = mapped_column(String(10))  # "now" | "later"
    scheduled_for: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # What the driver is looking for: a registration, or "silver Ford Focus".
    vehicle: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Where the customer actually is, resolved by the browser at booking time.
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

    # When each step happened: the tracking page's timeline, and the measured
    # response time.
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    en_route_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    on_scene_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(10), nullable=True)

    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


# ── Accounts ────────────────────────────────────────────────────────────────


class User(Base):
    """Somebody who signs in: an admin in the office, or a driver.

    One account per person, replacing the single shared operator key that
    everybody used to paste in. A person can now be suspended, audited and
    locked out on their own.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    role: Mapped[str] = mapped_column(String(10), index=True)  # "admin" | "driver"

    # Null until the person sets one from an invite link.
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AuthSession(Base):
    """A signed-in browser. Only the token's hash is stored."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(160), nullable=True)


class PasswordToken(Base):
    """A one-time link to set a password: a reset, or an invite to a new account."""

    __tablename__ = "password_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(10))  # "reset" | "invite"
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Driver(Base):
    """A driver: their application, their paperwork status, and where they are.

    Coordinates here are a person's live location. They are returned to admins,
    and to a customer only for the driver on their own job while that driver is
    on the way.
    """

    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # draft → submitted → active, or rejected; an active driver can be
    # suspended and reinstated. Only "active" drivers are dispatched.
    application_status: Mapped[str] = mapped_column(String(12), default="draft", index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # About them.
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(120), nullable=True)
    town: Mapped[str | None] = mapped_column(String(80), nullable=True)
    postcode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # Their licence. `licence_checked_at` is the date an admin last checked it
    # against DVLA's records; approval waits for it.
    licence_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    licence_categories: Mapped[str | None] = mapped_column(String(40), nullable=True)
    licence_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    licence_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    licence_checked_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Their truck.
    vehicle_reg: Mapped[str | None] = mapped_column(String(10), nullable=True)
    vehicle_make_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vehicle_gvw_kg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    operator_licence_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    motorway_work: Mapped[bool] = mapped_column(Boolean, default=False)

    # On duty and taking jobs. The driver's own switch, not dispatch's.
    available: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Off the roster entirely (left, removed) — distinct from merely off duty.
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    located_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    current_booking_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    busy_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class DriverDocument(Base):
    """One uploaded document and the decision about it.

    Replacing a document never deletes the old one: it is marked superseded
    once the new one is approved, so the record of what was checked, when and
    by whom survives.
    """

    __tablename__ = "driver_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    driver_id: Mapped[int] = mapped_column(Integer, index=True)
    doc_type: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)

    # Expiry or issue date, depending on the document type.
    doc_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(60), nullable=True)

    file_name: Mapped[str] = mapped_column(String(120))
    content_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    superseded: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    __table_args__ = (Index("ix_driver_documents_driver_type", "driver_id", "doc_type"),)


class DriverDocumentFile(Base):
    """The bytes of a document, kept apart so listing documents never loads them.

    In the database rather than on disk because the API's host has no
    persistent disk: a file written there would vanish on the next deploy.
    """

    __tablename__ = "driver_document_files"

    document_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_label: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(40), index=True)
    target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (Index("ix_audit_events_target", "target_type", "target_id"),)


class Event(Base):
    """One thing that happened on the site.

    Deliberately anonymous. No phone number, no address, no name, no IP, no
    cookie — a session id generated per browser tab is enough to follow one
    visit through the funnel, and it dies with the tab.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), index=True)
    session_id: Mapped[str] = mapped_column(String(40), index=True)
    path: Mapped[str] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    device: Mapped[str | None] = mapped_column(String(20), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class Metric(Base):
    """Seed figures for the dispatch panel.

    Only `avg_response_minutes` is still read, and only until enough real jobs
    have been timed to replace it (see `main.get_metrics`).
    """

    __tablename__ = "metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rescues_today: Mapped[int] = mapped_column(Integer, default=148)
    drivers_available: Mapped[int] = mapped_column(Integer, default=7)
    avg_response_minutes: Mapped[int] = mapped_column(Integer, default=24)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
