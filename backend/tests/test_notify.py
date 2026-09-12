from app import notify
from app.notify import BookingDetails, format_when, notifications_enabled, render_booking_email


def _details(**overrides) -> BookingDetails:
    base: BookingDetails = {
        "id": 7,
        "region": "Manchester",
        "location": "M1 1AA",
        "destination": "Bolton",
        "phone": "07700900123",
        "service": "towing",
        "timing": "now",
        "scheduled_for": None,
        "distance_miles": 8.2,
        "duration_minutes": 19,
        "price": 70,
    }
    base.update(overrides)  # type: ignore[typeddict-item]
    return base


def test_render_includes_key_details():
    subject, html = render_booking_email(_details())
    assert "towing" in subject and "£70" in subject and "Manchester" in subject
    assert "07700900123" in html
    assert "8.2 mi" in html
    assert "Bolton" in html


def test_render_handles_missing_optionals():
    _, html = render_booking_email(
        _details(destination=None, distance_miles=None, duration_minutes=None, price=None)
    )
    assert "—" in html  # empty fields render as a dash, no crash


def test_render_shows_a_scheduled_time_readably():
    _, html = render_booking_email(
        _details(timing="later", scheduled_for="2026-09-14T08:30:00.000Z")
    )
    assert "2026-09-14T" not in html
    assert "14 Sep" in html


def test_format_when_uses_uk_time():
    # 08:30 UTC in September is 09:30 in the UK (BST), unless the host has no tz data.
    assert format_when("later", "2026-09-14T08:30:00.000Z") in (
        "Scheduled: Mon 14 Sep, 09:30",
        "Scheduled: Mon 14 Sep, 08:30",
    )
    assert format_when("now", None) == "ASAP (now)"
    assert format_when("later", None) == "Scheduled · time not given"


def test_notifications_disabled_without_config(monkeypatch):
    monkeypatch.setattr(notify.settings, "resend_api_key", "")
    monkeypatch.setattr(notify.settings, "notify_email_to", "")
    assert notifications_enabled() is False


def test_send_is_a_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(notify.settings, "resend_api_key", "")
    called = False

    def fake_post(*args, **kwargs):  # pragma: no cover - must never run
        nonlocal called
        called = True

    monkeypatch.setattr(notify.httpx, "post", fake_post)
    notify.send_booking_notification(_details())
    assert called is False


def test_send_posts_to_resend_when_configured(monkeypatch):
    monkeypatch.setattr(notify.settings, "resend_api_key", "re_test")
    monkeypatch.setattr(notify.settings, "notify_email_to", "ops@example.com")
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["auth"] = headers["Authorization"]
        return FakeResponse()

    monkeypatch.setattr(notify.httpx, "post", fake_post)
    notify.send_booking_notification(_details())

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["auth"] == "Bearer re_test"
    assert captured["json"]["to"] == ["ops@example.com"]
    assert "towing" in captured["json"]["subject"]
