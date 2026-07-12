"""Best-effort email alert to the operator when a booking lands.

Sends via Resend (https://resend.com) — a free-tier email API. Disabled unless
RESEND_API_KEY and NOTIFY_EMAIL_TO are set, and never raises into the request
path (failures are logged, not surfaced to the customer).
"""

import logging
from typing import TypedDict

import httpx

from .config import settings

logger = logging.getLogger("uvicorn.error")


class BookingDetails(TypedDict):
    id: int
    region: str
    location: str
    destination: str | None
    phone: str
    service: str
    timing: str
    scheduled_for: str | None
    distance_miles: float | None
    duration_minutes: int | None
    price: int | None


def notifications_enabled() -> bool:
    return bool(settings.resend_api_key and settings.notify_email_to)


def render_booking_email(b: BookingDetails) -> tuple[str, str]:
    """Return (subject, html) for a booking alert."""
    price = f"£{b['price']}" if b["price"] is not None else "—"
    when = "ASAP (now)" if b["timing"] == "now" else f"Scheduled: {b['scheduled_for']}"
    journey = (
        f"{b['distance_miles']} mi · ~{b['duration_minutes']} min"
        if b["distance_miles"] is not None
        else "—"
    )
    subject = f"New booking · {b['service']} · {b['region']} · {price}"
    rows = [
        ("Service", b["service"]),
        ("When", when),
        ("Pickup", b["location"]),
        ("Drop-off", b["destination"] or "—"),
        ("Phone", b["phone"]),
        ("Tow distance", journey),
        ("Quoted price", price),
        ("Region", b["region"]),
        ("Booking #", str(b["id"])),
    ]
    body = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#6b7280">{label}</td>'
        f'<td style="padding:4px 0;font-weight:600">{value}</td></tr>'
        for label, value in rows
    )
    html = (
        '<div style="font-family:system-ui,Arial,sans-serif">'
        '<h2 style="margin:0 0 12px">🚨 New recovery booking</h2>'
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
