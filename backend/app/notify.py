"""Best-effort email: booking alerts, application alerts and password links.

Sends via Resend (https://resend.com). Disabled unless RESEND_API_KEY is set,
and never raises into the request path: failures are logged, not surfaced.

Without a verified sending domain Resend only delivers to the address the
account was opened with. Password links to other people will not arrive until
a domain is verified, which is why admins can also copy a link from the
admin page and send it themselves.
"""

import logging
from datetime import datetime, timezone
from html import escape
from typing import NotRequired, TypedDict
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
    vehicle: NotRequired[str | None]
    pickup_lat: float | None
    pickup_lng: float | None
    motorway: bool
    distance_miles: float | None
    duration_minutes: int | None
    price: int | None
    track_token: NotRequired[str | None]


def notifications_enabled() -> bool:
    """Whether operator alerts are configured: a key and somewhere to send them."""
    return bool(settings.resend_api_key and settings.notify_email_to)


def send_email(to: list[str], subject: str, html: str) -> None:
    if not settings.resend_api_key or not to:
        return
    try:
        res = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.notify_email_from, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        res.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — email must never break the request
        logger.warning("email to %s failed: %s", ", ".join(to), exc)


def maps_url(place: str, lat: float | None = None, lng: float | None = None) -> str:
    """A Google Maps link: exact coordinates when known, else a search."""
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
    return "https://www.google.com/maps/search/?api=1&query=" + quote(place)


def track_url(token: str | None) -> str | None:
    if not token:
        return None
    return f"{settings.site_url.rstrip('/')}/track/{token}"


def tel_uri(phone: str) -> str:
    cleaned = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    return f"tel:{cleaned}"


def _link(label: str, href: str) -> str:
    return (
        f'<a href="{escape(href, quote=True)}" '
        'style="color:#1b4069;font-weight:600;text-decoration:underline">'
        f"{escape(label)}</a>"
    )


def _button(label: str, href: str, dark: bool = False) -> str:
    colours = "background:#0e151d;color:#ffffff" if dark else "background:#f5c518;color:#0e151d"
    return (
        f'<a href="{escape(href, quote=True)}" style="display:inline-block;{colours};'
        "font-weight:700;text-decoration:none;padding:12px 20px;margin:0 8px 8px 0;"
        f'border-radius:4px">{escape(label)}</a>'
    )


NEEDS_QUOTE = "Quote on call"


def format_when(timing: str, scheduled_for: str | None) -> str:
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
        subject = f"⚠ MOTORWAY · {subject}"
    pin = maps_url(b["location"], b.get("pickup_lat"), b.get("pickup_lng"))
    pickup_cell = _link(b["location"], pin)
    if b.get("pickup_lat") is None:
        pickup_cell += (
            '<br><span style="color:#6b7280;font-size:12px">'
            "searched by address — no exact pin</span>"
        )
    destination_cell = _link(b["destination"], maps_url(b["destination"])) if b["destination"] else "—"
    tracking = track_url(b.get("track_token"))

    rows = [
        ("Service", escape(b["service"])),
        ("When", escape(when)),
        ("Pickup", pickup_cell),
        ("Drop-off", destination_cell),
        ("Vehicle", escape(b.get("vehicle") or "not given")),
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
    if tracking:
        rows.append(("Customer tracking", _link(tracking, tracking)))
    body = "".join(
        f'<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">{label}</td>'
        f'<td style="padding:6px 0;font-weight:600">{value}</td></tr>'
        for label, value in rows
    )
    warning = (
        '<div style="background:#c0392b;color:#fff;padding:12px 16px;margin:0 0 16px;'
        'font-weight:700;border-radius:4px">⚠ MOTORWAY / HARD SHOULDER — live carriageway '
        "procedure, high-visibility, and National Highways or police notification before "
        "attending.</div>"
        if b.get("motorway")
        else ""
    )
    buttons = (
        '<div style="margin:0 0 20px">'
        + _button("📍 Navigate to pickup", pin)
        + _button("📞 Call customer", tel_uri(b["phone"]), dark=True)
        + "</div>"
    )
    html = (
        '<div style="font-family:system-ui,Arial,sans-serif">'
        '<h2 style="margin:0 0 12px">🚨 New recovery booking</h2>'
        f"{warning}{buttons}"
        f'<table style="border-collapse:collapse">{body}</table>'
        '<p style="color:#6b7280;font-size:12px;margin-top:16px">'
        "Take the job in the driver console so the customer sees you are on the way.</p></div>"
    )
    return subject, html


def send_booking_notification(details: BookingDetails) -> None:
    if not notifications_enabled():
        return
    subject, html = render_booking_email(details)
    send_email([settings.notify_email_to], subject, html)


def send_application_submitted(driver_name: str, driver_id: int) -> None:
    """Tell the office a driver application is waiting to be checked."""
    if not notifications_enabled():
        return
    link = f"{settings.site_url.rstrip('/')}/admin/drivers/{driver_id}"
    html = (
        '<div style="font-family:system-ui,Arial,sans-serif">'
        '<h2 style="margin:0 0 12px">New driver application</h2>'
        f"<p><strong>{escape(driver_name)}</strong> has sent their application and documents.</p>"
        f'<div style="margin:16px 0">{_button("Review the application", link)}</div>'
        '<p style="color:#6b7280;font-size:12px">Check each document, check the licence with '
        "DVLA, then approve or turn it down.</p></div>"
    )
    send_email([settings.notify_email_to], f"Driver application · {driver_name}", html)


def send_password_link(email: str, name: str, link: str, purpose: str) -> None:
    subject = "Set your password" if purpose == "invite" else "Reset your password"
    intro = (
        "An account has been created for you. Choose a password to get started."
        if purpose == "invite"
        else "Someone asked to reset the password for this account. If it was you, use the button below. "
        "If not, you can ignore this email."
    )
    html = (
        '<div style="font-family:system-ui,Arial,sans-serif">'
        f'<h2 style="margin:0 0 12px">{escape(subject)}</h2>'
        f"<p>Hi {escape(name)},</p><p>{escape(intro)}</p>"
        f'<div style="margin:16px 0">{_button(subject, link)}</div>'
        '<p style="color:#6b7280;font-size:12px">The link works once and expires soon.</p></div>'
    )
    send_email([email], subject, html)
