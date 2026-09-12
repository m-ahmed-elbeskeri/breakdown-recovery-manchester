"""Best-effort email alert to the operator when a booking lands.

Sends via Resend (https://resend.com) — a free-tier email API. Disabled unless
RESEND_API_KEY and NOTIFY_EMAIL_TO are set, and never raises into the request
path (failures are logged, not surfaced to the customer).
"""

import logging
from datetime import datetime, timezone
from html import escape
from typing import TypedDict
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from .config import settings

logger = logging.getLogger("uvicorn.error")

try:
    UK = ZoneInfo("Europe/London")
except ZoneInfoNotFoundError:  # no tz database on this host; UTC is within an hour
    UK = timezone.utc


class BookingDetails(TypedDict):
    id: int
    region: str
    location: str
    destination: str | None
    phone: str
    service: str
    timing: str
    scheduled_for: str | None
    pickup_lat: float | None
    pickup_lng: float | None
    motorway: bool
    distance_miles: float | None
    duration_minutes: int | None
    price: int | None


def notifications_enabled() -> bool:
    return bool(settings.resend_api_key and settings.notify_email_to)


def maps_url(place: str, lat: float | None = None, lng: float | None = None) -> str:
    """A Google Maps link for a pickup or drop-off.

    Prefers exact coordinates when the browser managed to resolve them: tapping
    a co-ordinate link drops the driver on the precise spot and hands straight
    off to turn-by-turn navigation. Falls back to a text search of what the
    customer typed, which is imprecise but always better than nothing.

    Uses the documented Maps URL scheme, so the same link opens the native app
    on a phone and the web map on a desktop.
    """
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
    return "https://www.google.com/maps/search/?api=1&query=" + quote(place)


def tel_uri(phone: str) -> str:
    """A dialable tel: URI. Spaces and punctuation are fine for a human to read
    but some mail clients refuse to linkify them, so the href keeps digits and
    a leading + only, while the visible label stays as the customer typed it."""
    cleaned = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    return f"tel:{cleaned}"


def _link(label: str, href: str) -> str:
    """An anchor styled to survive email clients that strip CSS classes."""
    return (
        f'<a href="{escape(href, quote=True)}" '
        'style="color:#1b4069;font-weight:600;text-decoration:underline">'
        f"{escape(label)}</a>"
    )


# What the customer was told when no price could be calculated. The site
# promises "We'll confirm your exact price on the call", so the alert has to
# say a price is owed rather than showing a bare dash the operator could read
# as a glitch — they are the one who has to keep that promise.
NEEDS_QUOTE = "Quote on call"


def format_when(timing: str, scheduled_for: str | None) -> str:
    """"ASAP (now)", or a booking as the operator reads it: "Mon 14 Sep, 09:30".

    The browser sends UTC ISO strings; shown raw, a 9:30 booking in summer
    reads as 08:30 and is easy to turn up an hour late for.
    """
    if timing == "now":
        return "ASAP (now)"
    if not scheduled_for:
        return "Scheduled · time not given"
    try:
        at = datetime.fromisoformat(scheduled_for.replace("Z", "+00:00"))
    except ValueError:
        return f"Scheduled: {scheduled_for}"
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    at = at.astimezone(UK)
    return f"Scheduled: {at:%a} {at.day} {at:%b}, {at:%H:%M}"


def render_booking_email(b: BookingDetails) -> tuple[str, str]:
    """Return (subject, html) for a booking alert."""
    has_price = b["price"] is not None
    price = f"£{b['price']}" if has_price else NEEDS_QUOTE
    when = format_when(b["timing"], b["scheduled_for"])
    journey = (
        f"{b['distance_miles']} mi · ~{b['duration_minutes']} min"
        if b["distance_miles"] is not None
        else "—"
    )
    subject = f"New booking · {b['service']} · {b['region']} · {price}"
    if b.get("motorway"):
        # Front of the subject line: the crew must know before they open it.
        subject = f"⚠ MOTORWAY · {subject}"
    # The pickup is the one field the driver acts on, so it is a live map link
    # rather than text to re-type into a phone at the side of a road. Every
    # other customer-supplied value is escaped: these strings are free text
    # from a public form and must never be trusted as HTML.
    pin = maps_url(b["location"], b.get("pickup_lat"), b.get("pickup_lng"))
    pickup_cell = _link(b["location"], pin)
    if b.get("pickup_lat") is None:
        pickup_cell += (
            '<br><span style="color:#6b7280;font-size:12px">'
            "searched by address — no exact pin</span>"
        )

    destination_cell = _link(b["destination"], maps_url(b["destination"])) if b["destination"] else "—"

    rows = [
        ("Service", escape(b["service"])),
        ("When", escape(when)),
        ("Pickup", pickup_cell),
        ("Drop-off", destination_cell),
        ("Phone", _link(b["phone"], tel_uri(b["phone"]))),
        ("Tow distance", escape(journey)),
        (
            "Quoted price",
            escape(price)
            if has_price
            else f'<span style="color:#c0392b">{escape(price)}</span>'
            '<br><span style="color:#6b7280;font-size:12px">'
            "customer was told you would confirm the price by phone</span>",
        ),
        ("Region", escape(b["region"])),
        ("Booking #", str(b["id"])),
    ]
    body = "".join(
        f'<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">{label}</td>'
        f'<td style="padding:6px 0;font-weight:600">{value}</td></tr>'
        for label, value in rows
    )
    # Two thumb-sized buttons above the detail table: this alert is read on a
    # phone, usually in a hurry, and the only two things the operator ever does
    # next are ring the customer and start driving to them.
    warning = (
        '<div style="background:#c0392b;color:#fff;padding:12px 16px;margin:0 0 16px;'
        'font-weight:700;border-radius:4px">⚠ MOTORWAY / HARD SHOULDER — live carriageway '
        'procedure, high-visibility, and National Highways or police notification before '
        'attending.</div>'
        if b.get("motorway")
        else ""
    )

    buttons = (
        '<div style="margin:0 0 20px">'
        f'<a href="{escape(pin, quote=True)}" '
        'style="display:inline-block;background:#f5c518;color:#0e151d;'
        "font-weight:700;text-decoration:none;padding:12px 20px;"
        'margin:0 8px 8px 0;border-radius:4px">📍 Navigate to pickup</a>'
        f'<a href="{escape(tel_uri(b["phone"]), quote=True)}" '
        'style="display:inline-block;background:#0e151d;color:#ffffff;'
        "font-weight:700;text-decoration:none;padding:12px 20px;"
        'margin:0 8px 8px 0;border-radius:4px">📞 Call customer</a>'
        "</div>"
    )

    html = (
        '<div style="font-family:system-ui,Arial,sans-serif">'
        '<h2 style="margin:0 0 12px">🚨 New recovery booking</h2>'
        f"{warning}"
        f"{buttons}"
        f'<table style="border-collapse:collapse">{body}</table>'
        '<p style="color:#6b7280;font-size:12px;margin-top:16px">'
        "Call the customer to confirm and dispatch.</p></div>"
    )
    return subject, html


def send_booking_notification(details: BookingDetails) -> None:
    if not notifications_enabled():
        return
    subject, html = render_booking_email(details)
    try:
        res = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.notify_email_from,
                "to": [settings.notify_email_to],
                "subject": subject,
                "html": html,
            },
            timeout=10,
        )
        res.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — never break the booking flow
        logger.warning("booking notification failed: %s", exc)
