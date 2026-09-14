"""Site analytics for the office.

Who comes, where from, what they do, and whether it turns into bookings and
calls. Built from the anonymous events the site sends (see src/telemetry.ts)
alongside the real bookings and driver records. Nothing here can identify a
visitor: a "visitor" is a random id that lived for one browser tab.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Iterable, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .auth import require_admin
from .db import get_db
from .timeutil import UK, aware, iso, now

router = APIRouter(prefix="/api/admin/analytics", tags=["analytics"])

BOOKING_FUNNEL = [
    ("page_view", "Landed on the site"),
    ("booking_started", "Typed a pickup"),
    ("details_done", "Gave a phone number"),
    ("service_chosen", "Chose a service"),
    ("quote_shown", "Saw a price"),
    ("dispatch_requested", "Pressed dispatch"),
    ("booking_confirmed", "Booking confirmed"),
]

# Events that happen to a visitor rather than things they did.
PASSIVE = {"page_view", "page_engagement", "vitals", "js_error"}
# Storage disabled in the browser: those events cannot be told apart.
UNTRACKED = "anonymous"
MAX_PAGE_SECONDS = 1800
RECRUIT_PATH = "/drive-with-us"
APPLY_PATH = "/drivers/apply"
VITALS = ["lcp", "inp", "cls", "fcp", "ttfb"]


# ── Response shapes ─────────────────────────────────────────────────────────


class Count(BaseModel):
    label: str
    count: int


class Kpis(BaseModel):
    visitors: int
    pageViews: int
    pagesPerVisit: float
    bounceRate: float
    avgEngagedSeconds: int
    bookings: int
    bookingSessions: int
    conversionRate: float
    calls: int
    callSessions: int
    quotes: int
    avgQuote: Optional[float]
    driverSignups: int
    applicationsSent: int


class SeriesPoint(BaseModel):
    label: str
    visitors: int
    pageViews: int
    bookings: int
    calls: int


class PageRow(BaseModel):
    path: str
    views: int
    visitors: int
    avgSeconds: int
    avgScroll: int


class OutcomeRow(BaseModel):
    label: str
    sessions: int
    bookings: int
    calls: int
    conversionRate: float


class FunnelStep(BaseModel):
    name: str
    label: str
    sessions: int
    pctOfEntry: float


class Vital(BaseModel):
    name: str
    p75: Optional[float]
    samples: int


class TrackingStats(BaseModel):
    visits: int
    cancelledOnline: int
    ratings: int
    avgRating: Optional[float]


class AnalyticsOut(BaseModel):
    days: int
    generatedAt: str
    hourly: bool
    current: Kpis
    previous: Kpis
    series: list[SeriesPoint]
    pages: list[PageRow]
    landingPages: list[OutcomeRow]
    sources: list[OutcomeRow]
    campaigns: list[OutcomeRow]
    areas: list[OutcomeRow]
    devices: list[Count]
    browsers: list[Count]
    screens: list[Count]
    bookingFunnel: list[FunnelStep]
    recruitFunnel: list[FunnelStep]
    services: list[Count]
    availabilityAtQuote: list[Count]
    callPlacements: list[Count]
    ctaClicks: list[Count]
    linkClicks: list[Count]
    outbound: list[Count]
    faqs: list[Count]
    findMe: list[Count]
    tracking: TrackingStats
    vitals: list[Vital]
    errors: list[Count]
    errorCount: int


class LiveEvent(BaseModel):
    at: str
    name: str
    path: str
    device: Optional[str]
    detail: str


class LiveOut(BaseModel):
    activeVisitors: int
    pages: list[Count]
    recent: list[LiveEvent]


# ── Reading events ──────────────────────────────────────────────────────────


@dataclass
class Row:
    name: str
    session: str
    path: str
    region: Optional[str]
    device: Optional[str]
    referrer: Optional[str]
    payload: dict
    at: datetime


def _load(db: Session, since: datetime, until: datetime) -> list[Row]:
    E = models.Event
    result = db.execute(
        select(E.name, E.session_id, E.path, E.region, E.device, E.referrer, E.payload, E.created_at)
        .where(E.created_at >= since, E.created_at < until)
        .order_by(E.created_at, E.id)
    ).all()
    return [
        Row(
            name=name,
            session=session,
            path=path or "/",
            region=region,
            device=device,
            referrer=referrer,
            payload=payload if isinstance(payload, dict) else {},
            at=aware(at),
        )
        for name, session, path, region, device, referrer, payload, at in result
    ]


def _num(value) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _text(value) -> Optional[str]:
    return value if isinstance(value, str) and value else None


def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _p75(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(0.75 * len(ordered)) - 1)], 3)


def _counts(values: Iterable, limit: int = 15) -> list[Count]:
    tally = Counter(str(v) for v in values if v is not None and v != "")
    return [Count(label=label, count=n) for label, n in tally.most_common(limit)]


def _count(db: Session, model, column, since: datetime, until: datetime, *where) -> int:
    return int(
        db.scalar(select(func.count()).select_from(model).where(column >= since, column < until, *where))
        or 0
    )


# ── One visit, from its events ──────────────────────────────────────────────


@dataclass
class Visit:
    landing: Optional[str] = None
    source: str = "direct"
    medium: Optional[str] = None
    campaign: Optional[str] = None
    device: Optional[str] = None
    browser: Optional[str] = None
    screen: Optional[str] = None
    region: Optional[str] = None
    page_views: int = 0
    interactions: int = 0
    engaged: float = 0.0
    booked: bool = False
    called: bool = False


def _visits(rows: list[Row]) -> dict[str, Visit]:
    visits: dict[str, Visit] = {}
    for r in rows:
        if r.session == UNTRACKED:
            continue
        v = visits.setdefault(r.session, Visit())
        v.device = v.device or r.device
        v.region = v.region or r.region
        if r.name == "page_view":
            v.page_views += 1
            if v.landing is None:
                v.landing = r.path
                v.source = _text(r.payload.get("utmSource")) or r.referrer or "direct"
                v.medium = _text(r.payload.get("utmMedium"))
                v.campaign = _text(r.payload.get("utmCampaign"))
                v.browser = _text(r.payload.get("browser"))
                v.screen = _text(r.payload.get("screen"))
        elif r.name == "page_engagement":
            seconds = _num(r.payload.get("seconds"))
            if seconds is not None:
                v.engaged += min(max(seconds, 0.0), MAX_PAGE_SECONDS)
        elif r.name not in PASSIVE:
            v.interactions += 1
            if r.name == "booking_confirmed":
                v.booked = True
            elif r.name == "call_clicked":
                v.called = True
    return visits


def _kpis(db: Session, rows: list[Row], visits: dict[str, Visit], since: datetime, until: datetime) -> Kpis:
    viewed = [v for v in visits.values() if v.page_views]
    page_views = sum(1 for r in rows if r.name == "page_view")
    quotes = [r.payload for r in rows if r.name == "quote_shown"]
    prices = [p for p in (_num(q.get("price")) for q in quotes) if p is not None]
    booked = sum(1 for v in visits.values() if v.booked)
    return Kpis(
        visitors=len(visits),
        pageViews=page_views,
        pagesPerVisit=round(page_views / len(viewed), 1) if viewed else 0.0,
        bounceRate=_pct(sum(1 for v in viewed if v.page_views == 1 and v.interactions == 0), len(viewed)),
        avgEngagedSeconds=round(sum(v.engaged for v in viewed) / len(viewed)) if viewed else 0,
        bookings=_count(db, models.Booking, models.Booking.created_at, since, until),
        bookingSessions=booked,
        conversionRate=_pct(booked, len(visits)),
        calls=sum(1 for r in rows if r.name == "call_clicked"),
        callSessions=sum(1 for v in visits.values() if v.called),
        quotes=len(quotes),
        avgQuote=round(sum(prices) / len(prices), 2) if prices else None,
        driverSignups=_count(
            db, models.User, models.User.created_at, since, until, models.User.role == "driver"
        ),
        applicationsSent=_count(db, models.Driver, models.Driver.submitted_at, since, until),
    )


def _series(db: Session, rows: list[Row], since: datetime, until: datetime, hourly: bool) -> list[SeriesPoint]:
    def key(at: datetime) -> str:
        local = aware(at).astimezone(UK)
        return local.strftime("%Y-%m-%dT%H:00") if hourly else local.date().isoformat()

    # Stepped an hour at a time so a 23-hour clocks-change day is never skipped.
    labels: list[str] = []
    seen: set[str] = set()
    cursor = since
    while cursor <= until:
        k = key(cursor)
        if k not in seen:
            seen.add(k)
            labels.append(k)
        cursor += timedelta(hours=1)
    if key(until) not in seen:
        labels.append(key(until))

    visitors: dict[str, set] = defaultdict(set)
    views: Counter = Counter()
    calls: Counter = Counter()
    bookings: Counter = Counter()
    for r in rows:
        k = key(r.at)
        if r.session != UNTRACKED:
            visitors[k].add(r.session)
        if r.name == "page_view":
            views[k] += 1
        elif r.name == "call_clicked":
            calls[k] += 1
    for at in db.scalars(
        select(models.Booking.created_at).where(
            models.Booking.created_at >= since, models.Booking.created_at < until
        )
    ):
        bookings[key(at)] += 1

    return [
        SeriesPoint(label=k, visitors=len(visitors[k]), pageViews=views[k], bookings=bookings[k], calls=calls[k])
        for k in labels
    ]


def _pages(rows: list[Row], limit: int = 25) -> list[PageRow]:
    views: Counter = Counter()
    visitors: dict[str, set] = defaultdict(set)
    seconds: Counter = Counter()
    scroll_total: Counter = Counter()
    scroll_samples: Counter = Counter()
    for r in rows:
        if r.name == "page_view":
            views[r.path] += 1
            visitors[r.path].add(r.session)
        elif r.name == "page_engagement":
            s = _num(r.payload.get("seconds"))
            if s is not None:
                seconds[r.path] += min(max(s, 0.0), MAX_PAGE_SECONDS)
            depth = _num(r.payload.get("scroll"))
            if depth is not None:
                scroll_total[r.path] += min(max(depth, 0.0), 100.0)
                scroll_samples[r.path] += 1
    return [
        PageRow(
            path=path,
            views=n,
            visitors=len(visitors[path]),
            avgSeconds=round(seconds[path] / n),
            avgScroll=round(scroll_total[path] / scroll_samples[path]) if scroll_samples[path] else 0,
        )
        for path, n in views.most_common(limit)
    ]


def _outcomes(visits: dict[str, Visit], label: Callable[[Visit], Optional[str]], limit: int = 20) -> list[OutcomeRow]:
    groups: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for v in visits.values():
        k = label(v)
        if not k:
            continue
        group = groups[k]
        group[0] += 1
        group[1] += int(v.booked)
        group[2] += int(v.called)
    ordered = sorted(groups.items(), key=lambda kv: (-kv[1][0], kv[0]))[:limit]
    return [
        OutcomeRow(label=k, sessions=s, bookings=b, calls=c, conversionRate=_pct(b, s))
        for k, (s, b, c) in ordered
    ]


def _steps(steps: list[tuple[str, str, int]]) -> list[FunnelStep]:
    entry = steps[0][2] if steps else 0
    return [FunnelStep(name=n, label=l, sessions=c, pctOfEntry=_pct(c, entry)) for n, l, c in steps]


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("", response_model=AnalyticsOut)
def analytics(
    days: int = 30,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AnalyticsOut:
    days = max(1, min(365, days))
    until = now()
    since = until - timedelta(days=days)
    before = since - timedelta(days=days)

    everything = _load(db, before, until)
    rows = [r for r in everything if r.at >= since]
    earlier = [r for r in everything if r.at < since]
    visits = _visits(rows)
    current = _kpis(db, rows, visits, since, until)
    previous = _kpis(db, earlier, _visits(earlier), before, since)

    sessions_by_name: dict[str, set] = defaultdict(set)
    sessions_by_path: dict[str, set] = defaultdict(set)
    for r in rows:
        if r.session == UNTRACKED:
            continue
        sessions_by_name[r.name].add(r.session)
        if r.name == "page_view":
            sessions_by_path[r.path].add(r.session)

    approved = _count(
        db, models.AuditEvent, models.AuditEvent.created_at, since, until,
        models.AuditEvent.action == "driver.approved",
    )
    quotes = [r.payload for r in rows if r.name == "quote_shown"]
    ratings = [
        rating
        for rating in db.scalars(
            select(models.Booking.rating).where(
                models.Booking.rating.is_not(None),
                models.Booking.finished_at >= since,
                models.Booking.finished_at < until,
            )
        )
        if rating is not None
    ]
    vital_values: dict[str, list[float]] = {name: [] for name in VITALS}
    for r in rows:
        if r.name != "vitals":
            continue
        for name in VITALS:
            value = _num(r.payload.get(name))
            if value is not None and value >= 0:
                vital_values[name].append(value)

    def payload_values(name: str, key: str):
        return (r.payload.get(key) for r in rows if r.name == name)

    return AnalyticsOut(
        days=days,
        generatedAt=iso(until),
        hourly=days <= 2,
        current=current,
        previous=previous,
        series=_series(db, rows, since, until, hourly=days <= 2),
        pages=_pages(rows),
        landingPages=_outcomes(visits, lambda v: v.landing),
        sources=_outcomes(visits, lambda v: f"{v.source} · {v.medium}" if v.medium else v.source),
        campaigns=_outcomes(visits, lambda v: f"{v.campaign} ({v.source})" if v.campaign else None),
        areas=_outcomes(visits, lambda v: v.region),
        devices=_counts(v.device for v in visits.values()),
        browsers=_counts(v.browser for v in visits.values()),
        screens=_counts(v.screen for v in visits.values()),
        bookingFunnel=_steps([(n, label, len(sessions_by_name[n])) for n, label in BOOKING_FUNNEL]),
        recruitFunnel=_steps(
            [
                ("recruit_page", "Saw the drive with us page", len(sessions_by_path[RECRUIT_PATH])),
                ("apply_page", "Opened the application form", len(sessions_by_path[APPLY_PATH])),
                ("signed_up", "Created a driver account", current.driverSignups),
                ("sent", "Sent their application", current.applicationsSent),
                ("approved", "Approved by the office", approved),
            ]
        ),
        services=_counts(q.get("service") for q in quotes),
        availabilityAtQuote=_counts(
            "driver on duty" if q.get("driverAvailable") else "nobody on duty" for q in quotes
        ),
        callPlacements=_counts(payload_values("call_clicked", "placement")),
        ctaClicks=_counts(payload_values("cta_clicked", "label")),
        linkClicks=_counts(payload_values("link_clicked", "to")),
        outbound=_counts(payload_values("outbound_clicked", "host")),
        faqs=_counts(payload_values("faq_opened", "q")),
        findMe=_counts(
            "found them" if r.payload.get("ok") else "failed" for r in rows if r.name == "find_me_used"
        ),
        tracking=TrackingStats(
            visits=len(sessions_by_path["/track"]),
            cancelledOnline=sum(1 for r in rows if r.name == "track_cancelled"),
            ratings=len(ratings),
            avgRating=round(sum(ratings) / len(ratings), 1) if ratings else None,
        ),
        vitals=[Vital(name=name, p75=_p75(vital_values[name]), samples=len(vital_values[name])) for name in VITALS],
        errors=_counts(r.path for r in rows if r.name == "js_error"),
        errorCount=sum(1 for r in rows if r.name == "js_error"),
    )


def _describe(r: Row) -> str:
    """One short line about an event, for the live feed."""
    p = r.payload
    if r.name == "page_view":
        if not p.get("landing"):
            return ""
        source = _text(p.get("utmSource")) or (r.referrer if r.referrer and r.referrer != "direct" else None)
        return f"arrived from {source}" if source else "arrived directly"
    if r.name == "page_engagement":
        seconds = int(_num(p.get("seconds")) or 0)
        scroll = int(_num(p.get("scroll")) or 0)
        return f"{seconds}s on the page, {scroll}% scrolled"
    if r.name in ("quote_shown", "dispatch_requested", "booking_confirmed"):
        price = _num(p.get("price"))
        parts = [f"£{price:g}" if price is not None else None, _text(p.get("service"))]
        return " ".join(part for part in parts if part)
    if r.name == "track_rated":
        stars = _num(p.get("stars"))
        return f"{int(stars)} stars" if stars is not None else ""
    if r.name == "find_me_used":
        return "found them" if p.get("ok") else "failed"
    for key in ("placement", "label", "to", "host", "q", "status", "kind", "service", "step"):
        value = p.get(key)
        if value is not None and value != "":
            return str(value)
    return ""


@router.get("/live", response_model=LiveOut)
def live(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LiveOut:
    moment = now()
    rows = _load(db, moment - timedelta(minutes=30), moment + timedelta(minutes=1))
    active_since = moment - timedelta(minutes=5)

    where: dict[str, str] = {}
    for r in rows:
        if r.at < active_since or r.session == UNTRACKED:
            continue
        if r.name == "page_view" or r.session not in where:
            where[r.session] = r.path

    recent = [r for r in rows if r.name != "vitals"][-40:][::-1]
    return LiveOut(
        activeVisitors=len(where),
        pages=_counts(where.values(), limit=10),
        recent=[
            LiveEvent(at=iso(r.at), name=r.name, path=r.path, device=r.device, detail=_describe(r))
            for r in recent
        ],
    )
