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
    status: str
    createdAt: str
