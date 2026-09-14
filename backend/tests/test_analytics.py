"""The office analytics: traffic, sources, funnels, speed and the live view."""

from datetime import timedelta

from app import models
from app.timeutil import now


def event(name="page_view", session="s1", path="/", **over):
    e = {"name": name, "sessionId": session, "path": path, "device": "mobile"}
    e.update(over)
    return e


def send(client, *events):
    response = client.post("/api/events", json={"events": list(events)})
    assert response.status_code == 204
    return response


def get(client, headers, days=30):
    response = client.get(f"/api/admin/analytics?days={days}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_analytics_needs_an_admin(client):
    assert client.get("/api/admin/analytics").status_code == 401
    assert client.get("/api/admin/analytics/live").status_code == 401


def test_an_empty_site_reports_zeros(client, admin_headers):
    body = get(client, admin_headers, days=7)
    assert body["current"]["visitors"] == 0
    assert body["current"]["avgQuote"] is None
    assert len(body["series"]) >= 7
    assert all(step["pctOfEntry"] == 0 for step in body["bookingFunnel"])
    assert body["hourly"] is False
    assert get(client, admin_headers, days=1)["hourly"] is True


def test_visitors_page_views_and_visits_that_left_straight_away(client, admin_headers):
    send(
        client,
        event(session="a", payload={"landing": True}),
        event(session="b", payload={"landing": True}),
        event("cta_clicked", session="b", payload={"label": "header-book"}),
        event(session="b", path="/pricing"),
    )
    body = get(client, admin_headers)
    kpis = body["current"]
    assert kpis["visitors"] == 2
    assert kpis["pageViews"] == 3
    assert kpis["pagesPerVisit"] == 1.5
    assert kpis["bounceRate"] == 50.0
    assert body["ctaClicks"] == [{"label": "header-book", "count": 1}]


def test_sources_and_campaigns_are_credited_with_bookings_and_calls(client, admin_headers):
    send(
        client,
        event(
            session="ad",
            payload={"landing": True, "utmSource": "facebook", "utmMedium": "paid", "utmCampaign": "september"},
        ),
        event("booking_confirmed", session="ad", payload={"price": 90, "service": "towing"}),
        event(session="search", referrer="google.com", payload={"landing": True}),
        event("call_clicked", session="search", payload={"placement": "hero"}),
        event(session="plain", referrer="direct", payload={"landing": True}),
    )
    body = get(client, admin_headers)
    sources = {row["label"]: row for row in body["sources"]}
    assert sources["facebook · paid"]["bookings"] == 1
    assert sources["facebook · paid"]["conversionRate"] == 100.0
    assert sources["google.com"]["calls"] == 1
    assert sources["direct"]["sessions"] == 1
    assert body["campaigns"][0]["label"] == "september (facebook)"
    assert body["callPlacements"] == [{"label": "hero", "count": 1}]
    assert body["current"]["bookingSessions"] == 1
    assert body["current"]["callSessions"] == 1
    assert body["current"]["conversionRate"] == round(100 / 3, 1)


def test_the_previous_period_is_reported_alongside(client, admin_headers, session_factory):
    with session_factory() as db:
        db.add(models.Event(name="page_view", session_id="last-month", path="/", created_at=now() - timedelta(days=40)))
        db.add(models.Event(name="page_view", session_id="too-old", path="/", created_at=now() - timedelta(days=70)))
        db.commit()
    send(client, event(session="this-month"))
    body = get(client, admin_headers, days=30)
    assert body["current"]["visitors"] == 1
    assert body["previous"]["visitors"] == 1


def test_pages_report_time_on_screen_and_scroll_depth(client, admin_headers):
    send(
        client,
        event(session="a", path="/pricing"),
        event("page_engagement", session="a", path="/pricing", payload={"seconds": 40, "scroll": 80}),
        event(session="b", path="/pricing"),
        event("page_engagement", session="b", path="/pricing", payload={"seconds": 20, "scroll": 40}),
        # A tab left open overnight counts as half an hour, not twelve.
        event("page_engagement", session="b", path="/pricing", payload={"seconds": 99999}),
    )
    body = get(client, admin_headers)
    page = next(p for p in body["pages"] if p["path"] == "/pricing")
    assert page["views"] == 2 and page["visitors"] == 2
    assert page["avgScroll"] == 60
    assert page["avgSeconds"] == round((40 + 20 + 1800) / 2)
    assert body["current"]["avgEngagedSeconds"] == round((40 + 20 + 1800) / 2)


def test_the_recruitment_funnel_counts_real_sign_ups(client, admin_headers, make_user):
    send(
        client,
        event(session="d1", path="/drive-with-us"),
        event(session="d2", path="/drive-with-us"),
        event(session="d1", path="/drivers/apply"),
    )
    make_user(role="driver")
    steps = {s["name"]: s for s in get(client, admin_headers)["recruitFunnel"]}
    assert steps["recruit_page"]["sessions"] == 2
    assert steps["apply_page"]["sessions"] == 1
    assert steps["apply_page"]["pctOfEntry"] == 50.0
    assert steps["signed_up"]["sessions"] == 1


def test_site_speed_is_the_slowest_quarter(client, admin_headers):
    send(
        client,
        *[
            event("vitals", session=f"v{i}", payload={"lcp": ms, "cls": 0.02})
            for i, ms in enumerate([1000, 2000, 3000, 4000])
        ],
    )
    vitals = {v["name"]: v for v in get(client, admin_headers)["vitals"]}
    assert vitals["lcp"]["p75"] == 3000
    assert vitals["lcp"]["samples"] == 4
    assert vitals["inp"]["p75"] is None


def test_intake_drops_tokens_private_pages_and_anything_that_is_not_a_short_label(client, session_factory):
    send(
        client,
        event(path="/track/secret-token-123"),
        event(path="/admin/drivers/4"),
        event(path="/driver/documents"),
        event(name="Not A Name!"),
        event("quote_shown", payload={"price": 90, "address": "x" * 61, "nested": {"phone": "07700900123"}}),
    )
    with session_factory() as db:
        rows = db.query(models.Event).order_by(models.Event.id).all()
    assert [r.path for r in rows] == ["/track", "/"]
    assert rows[1].payload == {"price": 90}


def test_the_live_view_shows_who_is_on_the_site_now(client, admin_headers, session_factory):
    with session_factory() as db:
        db.add(models.Event(name="page_view", session_id="gone", path="/", created_at=now() - timedelta(minutes=20)))
        db.commit()
    send(
        client,
        event(session="here", path="/pricing", referrer="google.com", payload={"landing": True}),
        event("call_clicked", session="here", path="/pricing", payload={"placement": "header"}),
    )
    body = client.get("/api/admin/analytics/live", headers=admin_headers).json()
    assert body["activeVisitors"] == 1
    assert body["pages"] == [{"label": "/pricing", "count": 1}]
    assert body["recent"][0]["name"] == "call_clicked"
    assert body["recent"][0]["detail"] == "header"
    assert any(e["detail"] == "arrived from google.com" for e in body["recent"])


def test_events_sent_as_plain_text_are_stored(client, session_factory):
    """Beacons go as text/plain so the browser needs no preflight to another domain."""
    body = '{"events": [{"name": "call_clicked", "sessionId": "b1", "path": "/", "payload": {"placement": "hero"}}]}'
    response = client.post("/api/events", content=body, headers={"Content-Type": "text/plain;charset=UTF-8"})
    assert response.status_code == 204
    with session_factory() as db:
        assert db.query(models.Event).filter_by(name="call_clicked").count() == 1


def test_malformed_or_oversized_event_bodies_are_refused(client):
    headers = {"Content-Type": "text/plain"}
    assert client.post("/api/events", content="not json", headers=headers).status_code == 422
    one = '{"name": "page_view", "sessionId": "x", "path": "/"}'
    huge = '{"events": [' + ",".join([one] * 2000) + "]}"
    assert client.post("/api/events", content=huge, headers=headers).status_code == 413


def test_bots_and_scripts_are_not_counted(client, session_factory):
    for agent in (
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "facebookexternalhit/1.1",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0",
        "curl/8.4.0",
    ):
        response = client.post(
            "/api/events", json={"events": [event()]}, headers={"User-Agent": agent}
        )
        assert response.status_code == 204
    with session_factory() as db:
        assert db.query(models.Event).count() == 0


def test_only_real_events_with_clean_labels_are_kept(client, session_factory):
    send(
        client,
        event("made_up_event"),
        event(referrer="<script>evil.example</script>", region="Bolton; DROP TABLE", device="fridge"),
    )
    with session_factory() as db:
        rows = db.query(models.Event).all()
    assert [r.name for r in rows] == ["page_view"]
    assert (rows[0].referrer, rows[0].region, rows[0].device) == (None, None, None)


def test_one_tab_cannot_flood_the_figures(client, session_factory, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "MAX_EVENTS_PER_SESSION_DAY", 3)
    send(client, *[event(session="flood") for _ in range(5)])
    send(client, event(session="flood"), event(session="someone-else"))
    with session_factory() as db:
        assert db.query(models.Event).filter_by(session_id="flood").count() == 3
        assert db.query(models.Event).filter_by(session_id="someone-else").count() == 1
