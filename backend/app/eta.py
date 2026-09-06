"""How long until the truck reaches a customer.

Two things decide it: how far the driver is from them right now, and how much of
the job in front of them is left. Quoting only the drive time would tell the
second caller of the evening the same twenty minutes as the first, which is the
kind of promise that loses a customer at the roadside.

This lives on the server for a reason. The driver's coordinates are a person's
live location; the public endpoint answers in minutes and never returns them.
"""

from datetime import datetime, timezone

import httpx

# Same public routing service the browser uses for tow distances.
OSRM = "https://router.project-osrm.org/route/v1/driving"

# What we fall back to when routing is unavailable. Deliberately a straight-line
# estimate rather than a stored average: a rough number derived from the real
# distance beats a confident one derived from nothing.
CRUDE_MPH = 24.0
MILES_PER_DEGREE_LAT = 69.0

# Time on scene once the driver arrives — winching, strapping, paperwork.
ON_SCENE_MINUTES = 25


def _haversine_miles(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Straight-line miles. Only used when the router can't be reached."""
    import math

    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    dlat = lat2 - lat1
    dlng = math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * 3958.8 * math.asin(min(1.0, math.sqrt(h)))


def drive_minutes(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> int | None:
    """Driving minutes between two points, or `None` if it cannot be worked out."""
    url = f"{OSRM}/{from_lng},{from_lat};{to_lng},{to_lat}?overview=false"
    try:
        res = httpx.get(url, timeout=6)
        res.raise_for_status()
        route = (res.json().get("routes") or [None])[0]
        if route:
            return max(1, round(route["duration"] / 60))
    except Exception:  # noqa: BLE001 — routing is best-effort, never fatal
        pass

    # Fall back to crow-flies at town speed rather than giving up entirely.
    miles = _haversine_miles(from_lat, from_lng, to_lat, to_lng)
    if miles > 200:  # implausible for this business; treat as unknown
        return None
    return max(1, round(miles / CRUDE_MPH * 60))


def position_is_fresh(located_at: datetime | None) -> bool:
    """Whether a reported position is recent enough to quote a wait from."""
    if located_at is None:
        return False
    if located_at.tzinfo is None:
        located_at = located_at.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - located_at).total_seconds() / 60
    return age <= POSITION_MAX_AGE_MINUTES


def minutes_until(when: datetime | None) -> int:
    """Whole minutes from now until `when`, never negative."""
    if when is None:
        return 0
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    delta = (when - datetime.now(timezone.utc)).total_seconds() / 60
    return max(0, round(delta))


def estimate_finish_minutes(travel_minutes: int, tow_minutes: int | None) -> int:
    """How long a job takes from setting off: drive out, work, then the tow."""
    return travel_minutes + ON_SCENE_MINUTES + (tow_minutes or 0)
