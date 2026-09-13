import re
from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .compliance import (
    LICENCE_CATEGORIES,
    LICENCE_NUMBER,
    UK_POSTCODE,
    UK_REGISTRATION,
    VEHICLE_TYPES,
)
from .phone import normalise_phone

# Field names are camelCase to match the browser client's JSON exactly.

BookingStatus = Literal["pending", "accepted", "en_route", "on_scene", "complete", "cancelled"]

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def normalise_email(value: str) -> str:
    cleaned = value.strip().lower()
    if len(cleaned) > 254 or not _EMAIL.match(cleaned):
        raise ValueError("Enter a valid email address.")
    return cleaned


# ── Bookings ────────────────────────────────────────────────────────────────


class BookingCreate(BaseModel):
    requestId: str = Field(min_length=1, max_length=64)
    region: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1)
    destination: Optional[str] = None
    phone: str = Field(min_length=1, max_length=40)
    service: str = Field(min_length=1, max_length=40)
    timing: Literal["now", "later"]
    scheduledFor: Optional[str] = None
    vehicle: Optional[str] = Field(default=None, max_length=80)
    pickupLat: Optional[float] = Field(default=None, ge=-90, le=90)
    pickupLng: Optional[float] = Field(default=None, ge=-180, le=180)
    motorway: bool = False
    distanceMiles: Optional[float] = None
    durationMinutes: Optional[int] = None
    price: Optional[int] = None

    @field_validator("phone")
    @classmethod
    def _phone_can_be_rung(cls, value: str) -> str:
        return normalise_phone(value)

    @field_validator("vehicle")
    @classmethod
    def _blank_vehicle_is_none(cls, value: Optional[str]) -> Optional[str]:
        cleaned = (value or "").strip()
        return cleaned or None


class BookingCreated(BaseModel):
    bookingId: int
    eta: int
    etaSource: Literal["driver", "fallback"] = "fallback"
    trackToken: Optional[str] = None


class MetricsOut(BaseModel):
    rescuesToday: int
    driversAvailable: int
    avgResponseMinutes: int
    measured: bool = False


class BookingOut(BaseModel):
    id: int
    region: str
    location: str
    destination: Optional[str]
    # Hidden from drivers until the job is theirs.
    phone: Optional[str]
    service: str
    timing: str
    scheduledFor: Optional[str]
    vehicle: Optional[str]
    pickupLat: Optional[float]
    pickupLng: Optional[float]
    motorway: bool
    distanceMiles: Optional[float]
    durationMinutes: Optional[int]
    price: Optional[int]
    driverId: Optional[int]
    driverName: Optional[str]
    status: str
    # The customer's key to their booking. Admins only: it can cancel the job.
    trackToken: Optional[str]
    createdAt: str
    acceptedAt: Optional[str]
    enRouteAt: Optional[str]
    onSceneAt: Optional[str]
    finishedAt: Optional[str]
    cancelledBy: Optional[str]
    rating: Optional[int]
    ratingComment: Optional[str]


class BookingStatusIn(BaseModel):
    status: BookingStatus
    driverId: Optional[int] = None


class DriverJobStatusIn(BaseModel):
    # "pending" hands a job back to the queue.
    status: Literal["pending", "accepted", "en_route", "on_scene", "complete"]


# ── Drivers on the road ─────────────────────────────────────────────────────


class DriverStateIn(BaseModel):
    available: Optional[bool] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
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


class EtaOut(BaseModel):
    """Public. Deliberately carries no coordinates."""

    driversOnDuty: int
    etaMinutes: Optional[int]
    queueMinutes: int
    source: Literal["driver", "fallback"]


# ── Customer tracking ───────────────────────────────────────────────────────


class TrackDriver(BaseModel):
    name: str
    phone: Optional[str]
    lat: Optional[float]
    lng: Optional[float]
    locatedAt: Optional[str]
    vehicleReg: Optional[str] = None
    vehicleDescription: Optional[str] = None
    hasPhoto: bool = False


class TrackOut(BaseModel):
    id: int
    status: BookingStatus
    service: str
    timing: str
    scheduledFor: Optional[str]
    location: str
    destination: Optional[str]
    vehicle: Optional[str]
    pickupLat: Optional[float]
    pickupLng: Optional[float]
    price: Optional[int]
    motorway: bool
    etaMinutes: Optional[int]
    etaSource: Literal["driver", "fallback"]
    driversOnDuty: int
    driver: Optional[TrackDriver]
    createdAt: str
    acceptedAt: Optional[str]
    enRouteAt: Optional[str]
    onSceneAt: Optional[str]
    finishedAt: Optional[str]
    cancelledBy: Optional[str]
    rating: Optional[int]
    canCancel: bool


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


# ── Accounts ────────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    phone: Optional[str]
    role: Literal["admin", "driver"]
    isActive: bool
    hasPassword: bool
    lastLoginAt: Optional[str]
    createdAt: str
    driverId: Optional[int] = None
    driverStatus: Optional[str] = None


class SessionOut(BaseModel):
    token: str
    expiresAt: str
    user: UserOut


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class SetupStatusOut(BaseModel):
    needsSetup: bool


class SetupIn(BaseModel):
    operatorKey: str = Field(max_length=200)
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return " ".join(value.split())


class PasswordChangeIn(BaseModel):
    currentPassword: str = Field(max_length=200)
    newPassword: str = Field(max_length=200)


class ResetRequestIn(BaseModel):
    email: str = Field(max_length=254)
    origin: Optional[str] = Field(default=None, max_length=200)


class ResetConfirmIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=200)


class PasswordTokenOut(BaseModel):
    valid: bool
    purpose: Optional[Literal["reset", "invite"]] = None
    name: Optional[str] = None
    email: Optional[str] = None


class InviteOut(BaseModel):
    userId: int
    driverId: Optional[int] = None
    setupPath: str
    expiresAt: str


class CreateAdminIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)


class InviteDriverIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    phone: Optional[str] = Field(default=None, max_length=40)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: Optional[str]) -> Optional[str]:
        return normalise_phone(value) if value and value.strip() else None


class LinkAccountIn(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)


class UserActiveIn(BaseModel):
    active: bool


# ── Driver applications ─────────────────────────────────────────────────────


class ApplyIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    phone: str = Field(max_length=40)
    password: str = Field(max_length=200)
    consent: bool

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalise_phone(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("consent")
    @classmethod
    def _consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Tick the box to agree to how we use your details.")
        return value


class DriverProfileIn(BaseModel):
    """Every field optional: only the fields sent are changed."""

    name: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=40)
    dateOfBirth: Optional[date] = None
    addressLine1: Optional[str] = Field(default=None, max_length=120)
    addressLine2: Optional[str] = Field(default=None, max_length=120)
    town: Optional[str] = Field(default=None, max_length=80)
    postcode: Optional[str] = Field(default=None, max_length=10)
    emergencyContactName: Optional[str] = Field(default=None, max_length=80)
    emergencyContactPhone: Optional[str] = Field(default=None, max_length=40)
    licenceNumber: Optional[str] = Field(default=None, max_length=24)
    licenceCategories: Optional[list[str]] = None
    licenceExpiry: Optional[date] = None
    licencePoints: Optional[int] = Field(default=None, ge=0, le=12)
    vehicleReg: Optional[str] = Field(default=None, max_length=12)
    vehicleMakeModel: Optional[str] = Field(default=None, max_length=80)
    vehicleType: Optional[str] = None
    vehicleGvwKg: Optional[int] = Field(default=None, ge=500, le=44000)
    operatorLicenceNumber: Optional[str] = Field(default=None, max_length=20)
    motorwayWork: Optional[bool] = None

    @field_validator("*", mode="before")
    @classmethod
    def _blank_is_none(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = " ".join(value.split())
            return value or None
        return value

    @field_validator("phone", "emergencyContactPhone")
    @classmethod
    def _phone(cls, value: Optional[str]) -> Optional[str]:
        return normalise_phone(value) if value else None

    @field_validator("dateOfBirth")
    @classmethod
    def _dob(cls, value: Optional[date]) -> Optional[date]:
        if value is not None and (value.year < 1920 or value >= date.today()):
            raise ValueError("Check your date of birth.")
        return value

    @field_validator("postcode")
    @classmethod
    def _postcode(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        compact = value.replace(" ", "").upper()
        formatted = f"{compact[:-3]} {compact[-3:]}" if len(compact) > 3 else compact
        if not UK_POSTCODE.match(formatted):
            raise ValueError("Enter a UK postcode, like M1 1AA.")
        return formatted

    @field_validator("licenceNumber")
    @classmethod
    def _licence(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        compact = value.replace(" ", "").upper()
        if not LICENCE_NUMBER.match(compact):
            raise ValueError(
                "That doesn't look like a UK licence number. It is 16 characters, "
                "in section 5 of your photocard."
            )
        return compact

    @field_validator("licenceCategories")
    @classmethod
    def _categories(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if not value:
            return None
        cleaned: list[str] = []
        for item in value:
            code = item.strip().upper()
            if code not in LICENCE_CATEGORIES:
                raise ValueError(f"Unknown licence category {item!r}.")
            if code not in cleaned:
                cleaned.append(code)
        return sorted(cleaned, key=LICENCE_CATEGORIES.index)

    @field_validator("vehicleReg")
    @classmethod
    def _reg(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        compact = value.replace(" ", "").upper()
        if not UK_REGISTRATION.match(compact):
            raise ValueError("Enter the registration, like AB12CDE.")
        return compact

    @field_validator("vehicleType")
    @classmethod
    def _vehicle_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VEHICLE_TYPES:
            raise ValueError("Choose a vehicle type from the list.")
        return value


class AdminDriverProfileIn(DriverProfileIn):
    # The day an admin checked the licence against DVLA's records.
    licenceCheckedAt: Optional[date] = None

    @field_validator("licenceCheckedAt")
    @classmethod
    def _checked(cls, value: Optional[date]) -> Optional[date]:
        if value is not None and value > date.today():
            raise ValueError("The check date can't be in the future.")
        return value


class DocumentOut(BaseModel):
    id: int
    docType: str
    label: str
    status: Literal["pending", "approved", "rejected"]
    docDate: Optional[str]
    validUntil: Optional[str]
    reference: Optional[str]
    fileName: str
    contentType: str
    sizeBytes: int
    uploadedAt: str
    reviewedAt: Optional[str]
    reviewedBy: Optional[str]
    rejectionReason: Optional[str]
    superseded: bool


class DocStateOut(BaseModel):
    key: str
    label: str
    group: str
    required: bool
    state: Literal["missing", "pending", "rejected", "approved", "expiring", "expired"]
    validUntil: Optional[str]
    currentDocId: Optional[int]
    approvedDocId: Optional[int]
    replacementPending: bool
    rejectionReason: Optional[str]


class ComplianceOut(BaseModel):
    items: list[DocStateOut]
    submitBlockers: list[str]
    approvalBlockers: list[str]
    workBlockers: list[str]
    motorwayBlockers: list[str]
    canSubmit: bool
    canApprove: bool
    canWork: bool
    canMotorway: bool


class DriverProfileOut(BaseModel):
    id: int
    userId: Optional[int]
    email: Optional[str]
    name: str
    phone: Optional[str]
    status: Literal["draft", "submitted", "active", "rejected", "suspended"]
    active: bool
    submittedAt: Optional[str]
    reviewedAt: Optional[str]
    reviewedBy: Optional[str]
    reviewNote: Optional[str]
    dateOfBirth: Optional[str]
    addressLine1: Optional[str]
    addressLine2: Optional[str]
    town: Optional[str]
    postcode: Optional[str]
    emergencyContactName: Optional[str]
    emergencyContactPhone: Optional[str]
    licenceNumber: Optional[str]
    licenceCategories: list[str]
    licenceExpiry: Optional[str]
    licencePoints: Optional[int]
    licenceCheckedAt: Optional[str]
    vehicleReg: Optional[str]
    vehicleMakeModel: Optional[str]
    vehicleType: Optional[str]
    vehicleGvwKg: Optional[int]
    operatorLicenceNumber: Optional[str]
    motorwayWork: bool
    hasPhoto: bool
    live: DriverOut
    documents: list[DocumentOut]
    compliance: ComplianceOut


class DriverSummaryOut(BaseModel):
    id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    status: str
    active: bool
    available: bool
    hasAccount: bool
    lastLoginAt: Optional[str]
    submittedAt: Optional[str]
    reviewedAt: Optional[str]
    vehicleReg: Optional[str]
    vehicleType: Optional[str]
    vehicleGvwKg: Optional[int]
    motorwayWork: bool
    pendingDocs: int
    missingDocs: int
    expiringDocs: int
    expiredDocs: int
    canWork: bool


class AuditOut(BaseModel):
    id: int
    createdAt: str
    actorUserId: Optional[int]
    actorLabel: str
    action: str
    targetType: Optional[str]
    targetId: Optional[int]
    detail: Optional[dict]


class AdminDriverDetailOut(BaseModel):
    profile: DriverProfileOut
    history: list[DocumentOut]
    audit: list[AuditOut]


class DocumentReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    reason: Optional[str] = Field(default=None, max_length=500)
    docDate: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=60)


class DriverDecisionIn(BaseModel):
    decision: Literal["approve", "reject", "suspend", "reinstate"]
    note: Optional[str] = Field(default=None, max_length=1000)


class ComplianceRowOut(BaseModel):
    driverId: int
    driverName: str
    driverStatus: str
    key: str
    label: str
    state: str
    validUntil: Optional[str]
    blocksWork: bool


# ── Telemetry ───────────────────────────────────────────────────────────────


class EventIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    sessionId: str = Field(min_length=1, max_length=40)
    path: str = Field(max_length=120)
    region: Optional[str] = Field(default=None, max_length=60)
    device: Optional[str] = Field(default=None, max_length=20)
    referrer: Optional[str] = Field(default=None, max_length=120)
    payload: Optional[dict] = None


class EventBatch(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=50)


class CountRow(BaseModel):
    label: str
    count: int


class FunnelStep(BaseModel):
    name: str
    label: str
    sessions: int
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
