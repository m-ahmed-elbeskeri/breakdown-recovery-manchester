from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
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

    distance_miles: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
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
