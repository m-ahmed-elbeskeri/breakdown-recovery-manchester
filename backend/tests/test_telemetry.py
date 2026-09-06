"""Anonymous telemetry, and the dashboard built on it."""

from app.config import settings

ADMIN = {"x-api-key": settings.admin_api_key}


def event(name="page_view", session="s1", **over):
    e = {"name": name, "sessionId": session, "path": "/", "region": "Bolton", "device": "mobile"}
    e.update(over)
    return e


def send(client, *events):
    return client.post("/api/events", json={"events": list(events)})


def test_events_are_accepted_and_counted(client):
    assert send(client, event(), event("booking_started")).status_code == 204
    body = client.get("/api/admin/telemetry", headers=ADMIN).json()
    assert body["events"] == 2
    assert body["sessions"] == 1


def test_telemetry_needs_the_key(client):
    assert client.get("/api/admin/telemetry").status_code == 401


def test_funnel_counts_visits_not_clicks(client):
    """Someone editing their pickup five times is one person, not five."""
    send(client, event(), *[event("booking_started") for _ in range(5)])
    funnel = {s["name"]: s["sessions"] for s in
              client.get("/api/admin/telemetry", headers=ADMIN).json()["funnel"]}
    assert funnel["booking_started"] == 1


def test_funnel_percentages_are_relative_to_arrivals(client):
    send(client, event(session="a"), event(session="b"))
    send(client, event("dispatch_requested", session="a"))
    steps = {s["name"]: s for s in
             client.get("/api/admin/telemetry", headers=ADMIN).json()["funnel"]}
    assert steps["page_view"]["sessions"] == 2
    assert steps["dispatch_requested"]["sessions"] == 1
    assert steps["dispatch_requested"]["pctOfEntry"] == 50.0


def test_quotes_are_summarised(client):
    send(
        client,
        event("quote_shown", payload={"price": 70, "service": "towing", "driverAvailable": True}),
        event("quote_shown", session="s2", payload={"price": 110, "service": "tow",
                                                    "driverAvailable": False}),
    )
    body = client.get("/api/admin/telemetry", headers=ADMIN).json()
    assert body["quotesShown"] == 2
    assert body["avgQuote"] == 90.0
    assert {r["label"] for r in body["availabilityAtQuote"]} == {
        "driver on duty",
        "nobody on duty",
    }


def test_regions_are_ranked(client):
    send(client, event(session="a", region="Bolton"), event(session="b", region="Bolton"))
    send(client, event(session="c", region="Sale"))
    regions = client.get("/api/admin/telemetry", headers=ADMIN).json()["topRegions"]
    assert regions[0]["label"] == "Bolton" and regions[0]["count"] == 2


def test_calls_are_counted_separately(client):
    send(client, event("call_clicked"), event("call_clicked", session="s2"))
    assert client.get("/api/admin/telemetry", headers=ADMIN).json()["callClicks"] == 2


def test_a_batch_is_capped(client):
    """A bad actor must not be able to post a novel in one request."""
    assert client.post(
        "/api/events", json={"events": [event() for _ in range(51)]}
    ).status_code == 422


def test_empty_window_does_not_error(client):
    body = client.get("/api/admin/telemetry?days=7", headers=ADMIN).json()
    assert body["sessions"] == 0
    assert body["avgQuote"] is None
    assert all(s["pctOfEntry"] == 0 for s in body["funnel"])
