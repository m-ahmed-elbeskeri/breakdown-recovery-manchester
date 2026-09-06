from typing import Literal, Optional

from pydantic import BaseModel, Field

# Field names are camelCase to match the browser client's JSON exactly.


class BookingCreate(BaseModel):
    requestId: str = Field(min_length=1, max_length=64)
    region: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1)
    destination: Optional[str] = None
    phone: str = Field(min_length=1, max_length=40)
    service: str = Field(min_length=1, max_length=40)
    timing: Literal["now", "later"]
    scheduledFor: Optional[str] = None
    pickupLat: Optional[float] = Field(default=None, ge=-90, le=90)
    pickupLng: Optional[float] = Field(default=None, ge=-180, le=180)
    motorway: bool = False
    distanceMiles: Optional[float] = None
    durationMinutes: Optional[int] = None
    price: Optional[int] = None


class BookingCreated(BaseModel):
    bookingId: int
    eta: int
    # Whether `eta` was measured from a driver's position or is the published
    # average. The confirmation screen states an arrival time as fact, and it
    # has no business doing that on the strength of an average.
    etaSource: Literal["driver", "fallback"] = "fallback"


class MetricsOut(BaseModel):
    rescuesToday: int
    driversAvailable: int
    avgResponseMinutes: int


class BookingOut(BaseModel):
    id: int
    region: str
    location: str
    destination: Optional[str]
    phone: str
    service: str
    timing: str
    scheduledFor: Optional[str]
    pickupLat: Optional[float]
    pickupLng: Optional[float]
    motorway: bool
    distanceMiles: Optional[float]
    durationMinutes: Optional[int]
    price: Optional[int]
    driverId: Optional[int]
    status: str
    createdAt: str


# -- Drivers -----------------------------------------------------------------
# Coordinates appear only on DriverOut, which is admin-only. The public ETA
# endpoint returns minutes and nothing that could locate a person.


class DriverCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=40)


class DriverStateIn(BaseModel):
    available: Optional[bool] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    # How much longer the driver reckons they will be. Overrides the estimate
    # made when they took the job, because they can see the recovery and we
    # cannot. 0 means free now. Capped at eight hours so a mistyped number
    # cannot take a truck out of dispatch for a week.
    busyMinutes: Optional[int] = Field(default=None, ge=0, le=480)


class DriverOut(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    available: bool
    lat: Optional[float]
    lng: Optional[float]
    locatedAt: Optional[str]
    currentBookingId: Optional[int]
    busyUntil: Optional[str]
    busyMinutes: int


class BookingStatusIn(BaseModel):
    status: Literal["pending", "accepted", "en_route", "on_scene", "complete", "cancelled"]
    driverId: Optional[int] = None


class EtaOut(BaseModel):
    """Public. Deliberately carries no coordinates."""

    driversOnDuty: int
    etaMinutes: Optional[int]
    queueMinutes: int
    source: Literal["driver", "fallback"]


# ── Telemetry ───────────────────────────────────────────────────────────────
# Anonymous by construction. There is no field here for a phone number, an
# address or a name, so none can arrive however the client is changed.


class EventIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    sessionId: str = Field(min_length=1, max_length=40)
    path: str = Field(max_length=120)
    region: Optional[str] = Field(default=None, max_length=60)
    device: Optional[str] = Field(default=None, max_length=20)
    referrer: Optional[str] = Field(default=None, max_length=120)
    # Small on purpose: a handful of numbers and short labels per event.
    payload: Optional[dict] = None


class EventBatch(BaseModel):
    # Batched so a browser sends one request on unload rather than one per
    # click. Capped so a bad actor cannot post a novel.
    events: list[EventIn] = Field(min_length=1, max_length=50)


class CountRow(BaseModel):
    label: str
    count: int


class FunnelStep(BaseModel):
    name: str
    label: str
    sessions: int
    """Share of sessions that reached the first step."""
    pctOfEntry: float


class TelemetryOut(BaseModel):
    days: int
    sessions: int
    events: int
    bookings: int
    callClicks: int
    funnel: list[FunnelStep]
    topRegions: list[CountRow]
    services: list[CountRow]
    devices: list[CountRow]
    referrers: list[CountRow]
    daily: list[CountRow]
    quotesShown: int
    avgQuote: Optional[float]
    availabilityAtQuote: list[CountRow]
