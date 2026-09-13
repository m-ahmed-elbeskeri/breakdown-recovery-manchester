"""Time, in one place.

Timestamps are stored in UTC. Document dates (an insurance expiry, a licence
expiry) are UK calendar dates, so "has it expired" is asked of today's date in
London, not in UTC: at 00:30 on the day a policy ends it has ended.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    UK = ZoneInfo("Europe/London")
except ZoneInfoNotFoundError:  # no tz database on this host; UTC is within an hour
    UK = timezone.utc


def now() -> datetime:
    return datetime.now(timezone.utc)


def today_uk() -> date:
    return now().astimezone(UK).date()


def aware(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat them as the UTC they were stored as."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def iso(value: datetime | None) -> str | None:
    value = aware(value)
    return value.isoformat() if value else None


def iso_date(value: date | None) -> str | None:
    return value.isoformat() if value else None
