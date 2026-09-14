// Anonymous site analytics.
//
// The operator's questions: how many people come and from where (which
// search, which advert), what they look at, where they give up in the booking
// form, how many ring instead of booking, whether the pages are fast, and
// whether anything is broken. All of those are answerable without knowing who
// anybody is, so this knows nothing about anybody.
//
// No cookie, no identifier that outlives the tab, no IP logging, and no free
// text: the customer's phone number, name and address are never arguments to
// `track`, and payloads are whitelisted to numbers, booleans and short labels.
// Tracking-link tokens are stripped from paths, and the pages staff and
// drivers use after signing in are never measured at all.

import { API_BASE } from './api';

const SESSION_KEY = 'crnm_session';
const LANDED_KEY = 'crnm_landed';
/** Hold events briefly so a visit costs one request, not twenty. */
const FLUSH_AFTER_MS = 4000;
const MAX_BATCH = 20;
const MAX_ERRORS_PER_PAGE = 5;
const MAX_PAGE_SECONDS = 1800;

/** Only these may appear in a payload. Anything else is dropped, silently. */
type Primitive = string | number | boolean | null;
export type EventPayload = Record<string, Primitive>;

export type EventName =
  | 'page_view'
  | 'page_engagement'
  | 'link_clicked'
  | 'cta_clicked'
  | 'outbound_clicked'
  | 'email_clicked'
  | 'call_clicked'
  | 'faq_opened'
  | 'booking_started'
  | 'details_done'
  | 'service_chosen'
  | 'quote_shown'
  | 'dispatch_requested'
  | 'booking_confirmed'
  | 'form_error'
  | 'find_me_used'
  | 'track_viewed'
  | 'track_cancelled'
  | 'track_rated'
  | 'install_prompted'
  | 'vitals'
  | 'js_error';

interface QueuedEvent {
  name: EventName;
  sessionId: string;
  path: string;
  region?: string;
  device?: string;
  referrer?: string;
  payload?: EventPayload;
}

const PRIVATE_PATH = /^\/(admin|driver|login|forgot-password|reset-password)(\/|$)/;

/** Staff and drivers' signed-in pages are never measured. /drivers/apply is. */
export const isTrackedPath = (pathname: string): boolean => !PRIVATE_PATH.test(pathname);

const INTERNAL_KEY = 'crnm_internal';
const BOT_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|facebookexternalhit|embedly|preview/i;

/** Search engines, link previews, speed testers and monitors: not customers. */
export const isBotAgent = (ua: string): boolean => BOT_AGENT.test(ua);

let excludedBrowser: boolean | null = null;

/**
 * Leave this browser out of the analytics from now on. Called when anyone
 * signs in to the admin or the driver app, so the office checking the site
 * and drivers opening it never count as customers.
 */
export function markInternalBrowser(): void {
  excludedBrowser = true;
  try {
    localStorage.setItem(INTERNAL_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/**
 * Whether this browser is left out: signed in as staff or a driver before,
 * automated, or a known bot. `?notrack=1` excludes a browser by hand and
 * `?notrack=0` counts it again.
 */
function excluded(): boolean {
  if (excludedBrowser !== null) return excludedBrowser;
  let internal = false;
  try {
    const choice = new URLSearchParams(location.search).get('notrack');
    if (choice === '1') localStorage.setItem(INTERNAL_KEY, '1');
    if (choice === '0') localStorage.removeItem(INTERNAL_KEY);
    internal = localStorage.getItem(INTERNAL_KEY) === '1';
  } catch {
    /* storage unavailable */
  }
  excludedBrowser = internal || navigator.webdriver === true || isBotAgent(navigator.userAgent);
  return excludedBrowser;
}

/** A path safe to store. A tracking link's token opens somebody's booking. */
export function safePath(pathname: string): string {
  if (pathname.startsWith('/track/')) return '/track';
  return (pathname.replace(/\/+$/, '') || '/').slice(0, 120);
}

export function deviceFrom(ua: string): string {
  if (/iphone|ipod|android.*mobile/i.test(ua)) return 'mobile';
  if (/ipad|android/i.test(ua)) return 'tablet';
  return 'desktop';
}

/** The browser family only. In-app browsers matter: they are where adverts land. */
export function browserFrom(ua: string): string {
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook app';
  if (/Instagram/i.test(ua)) return 'instagram app';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

/** A campaign tag reduced to something that can only ever be a label. */
export function tag(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || null;
}

/**
 * Where a visit came from, from the tags on the link that brought it. Tag
 * advert links with utm_source and utm_campaign to see each advert's visits,
 * bookings and calls. Google and Facebook click ids count as their source.
 */
export function campaignFrom(search: string): EventPayload {
  const params = new URLSearchParams(search);
  let source = tag(params.get('utm_source'));
  let medium = tag(params.get('utm_medium'));
  if (!source && params.has('gclid')) {
    source = 'google-ads';
    medium = medium ?? 'cpc';
  }
  if (!source && params.has('fbclid')) source = 'facebook';
  const campaign = tag(params.get('utm_campaign'));
  const out: EventPayload = {};
  if (source) out.utmSource = source;
  if (medium) out.utmMedium = medium;
  if (campaign) out.utmCampaign = campaign;
  return out;
}

/** Strip anything that is not a short scalar. Belt and braces over the types. */
export function clean(payload?: EventPayload): EventPayload | undefined {
  if (!payload) return undefined;
  const out: EventPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else if (typeof value === 'string' && value.length <= 40) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Per-tab, random, and gone when the tab closes. Never a cookie. */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Private mode with storage disabled: the visit is simply uncounted.
    return 'anonymous';
  }
}

/**
 * The referring site, host only. A full URL can carry a search query, which
 * is somebody's words, and the host answers the question anyway.
 */
function referrer(): string | undefined {
  try {
    if (!document.referrer) return 'direct';
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? undefined : host.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function screenSize(): string {
  const width = window.innerWidth;
  if (width < 640) return 'small';
  if (width < 1024) return 'medium';
  return 'large';
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let currentRegion: string | undefined;

/** Told once per page so every event can be attributed to an area. */
export function setTelemetryRegion(region: string | undefined): void {
  currentRegion = region;
}

function flush(useBeacon = false): void {
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue });
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }

  const url = `${API_BASE}/api/events`;
  // Sent as text/plain on purpose. The API is on another domain, and a JSON
  // content type makes the browser ask its permission first (a preflight). A
  // beacon sent as the page closes cannot wait for that answer, so call taps,
  // time on page and site speed were all being dropped. The API reads the
  // body as JSON whatever it is labelled.
  const type = 'text/plain;charset=UTF-8';
  try {
    // On unload only sendBeacon is guaranteed to survive the page going away.
    // It refuses bodies over its size limit; those go by fetch instead.
    if (useBeacon && navigator.sendBeacon?.(url, new Blob([body], { type }))) return;
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': type },
      body,
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error to a stranded customer */
    });
  } catch {
    /* ditto */
  }
}

function enqueue(name: EventName, payload: EventPayload | undefined, path: string): void {
  queue.push({
    name,
    sessionId: sessionId(),
    path,
    region: currentRegion,
    device: deviceFrom(navigator.userAgent),
    referrer: referrer(),
    payload: clean(payload),
  });
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (!timer) timer = setTimeout(() => flush(), FLUSH_AFTER_MS);
}

export function track(name: EventName, payload?: EventPayload): void {
  if (typeof window === 'undefined' || !isTrackedPath(location.pathname) || excluded()) return;
  enqueue(name, payload, safePath(location.pathname));
}

// ── Pages: views, time on screen, scroll depth ──────────────────────────────

interface PageState {
  path: string;
  kind: string;
  visibleMs: number;
  visibleSince: number | null;
  maxScroll: number;
  sent: boolean;
  errors: number;
}

let page: PageState | null = null;
let lastView: { path: string; at: number } | null = null;

function scrollDepth(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((window.scrollY / scrollable) * 100)));
}

/** How long the page was actually on screen, and how far down it was read. */
function sendEngagement(): void {
  if (!page || page.sent) return;
  if (page.visibleSince !== null) {
    page.visibleMs += Date.now() - page.visibleSince;
    page.visibleSince = null;
  }
  page.sent = true;
  const seconds = Math.min(MAX_PAGE_SECONDS, Math.round(page.visibleMs / 1000));
  if (seconds >= 1) {
    enqueue('page_engagement', { seconds, scroll: page.maxScroll, kind: page.kind }, page.path);
  }
}

/** Called by the app on every navigation. */
export function trackPageView(pathname: string, kind: string): void {
  if (typeof window === 'undefined') return;
  if (excluded()) {
    page = null;
    return;
  }
  const path = safePath(pathname);
  const at = Date.now();
  // React's development mode runs effects twice. One visit is one view.
  if (lastView && lastView.path === path && at - lastView.at < 1000) return;
  lastView = { path, at };

  sendEngagement();
  if (!isTrackedPath(pathname)) {
    page = null;
    return;
  }

  let landing = false;
  try {
    landing = !sessionStorage.getItem(LANDED_KEY);
    if (landing) sessionStorage.setItem(LANDED_KEY, '1');
  } catch {
    /* storage unavailable */
  }

  page = {
    path,
    kind,
    visibleMs: 0,
    visibleSince: document.visibilityState === 'visible' ? at : null,
    maxScroll: scrollDepth(),
    sent: false,
    errors: 0,
  };
  enqueue(
    'page_view',
    {
      kind,
      landing,
      browser: browserFrom(navigator.userAgent),
      screen: screenSize(),
      ...(landing ? campaignFrom(location.search) : {}),
    },
    path,
  );
}

// ── Clicks ──────────────────────────────────────────────────────────────────

function onClick(e: MouseEvent): void {
  const target = e.target as Element | null;
  if (!target?.closest || !isTrackedPath(location.pathname)) return;

  // Every tel: link on the site, caught in one place: calls are the main way
  // this business wins work, and a call button added later must not be missed.
  const tel = target.closest('a[href^="tel:"]');
  if (tel) {
    track('call_clicked', { placement: tel.getAttribute('data-call') ?? 'link' });
    // A tel: link leaves the page instantly on mobile; this cannot wait.
    flush(true);
    return;
  }

  const tagged = target.closest('[data-track]');
  const label = tagged?.getAttribute('data-track');
  if (label) {
    track('cta_clicked', { label: label.slice(0, 40) });
    return;
  }

  const link = target.closest('a[href]') as HTMLAnchorElement | null;
  if (!link) return;
  if (link.protocol === 'mailto:') {
    track('email_clicked');
    flush(true);
    return;
  }
  if (link.origin === location.origin) {
    const to = safePath(link.pathname);
    if (to !== safePath(location.pathname)) track('link_clicked', { to: to.slice(0, 40) });
    return;
  }
  if (link.protocol === 'http:' || link.protocol === 'https:') {
    track('outbound_clicked', { host: link.hostname.replace(/^www\./, '').slice(0, 40) });
    flush(true);
  }
}

// ── Errors and speed ────────────────────────────────────────────────────────

function reportError(kind: string): void {
  if (!page || page.errors >= MAX_ERRORS_PER_PAGE) return;
  page.errors += 1;
  // The kind only. An error message can quote whatever was on the page.
  track('js_error', { kind });
}

let sendVitals: (() => void) | null = null;

/** Core Web Vitals for the page the visit started on, measured by the browser. */
function observeVitals(): void {
  if (typeof PerformanceObserver === 'undefined') return;
  const vitals: { lcp?: number; cls: number; inp?: number; fcp?: number } = { cls: 0 };

  const observe = (
    type: string,
    handle: (entries: PerformanceEntryList) => void,
    extra: Record<string, number> = {},
  ) => {
    try {
      const observer = new PerformanceObserver((list) => handle(list.getEntries()));
      observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch {
      /* this browser does not measure it */
    }
  };

  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) vitals.lcp = last.startTime;
  });
  observe('layout-shift', (entries) => {
    for (const entry of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!entry.hadRecentInput) vitals.cls += entry.value;
    }
  });
  observe(
    'event',
    (entries) => {
      for (const entry of entries) vitals.inp = Math.max(vitals.inp ?? 0, entry.duration);
    },
    { durationThreshold: 40 },
  );
  observe('paint', (entries) => {
    const fcp = entries.find((entry) => entry.name === 'first-contentful-paint');
    if (fcp) vitals.fcp = fcp.startTime;
  });

  const round = (value?: number) => (value === undefined ? null : Math.round(value));
  let sent = false;
  sendVitals = () => {
    if (sent) return;
    sent = true;
    const nav = performance.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    track('vitals', {
      lcp: round(vitals.lcp),
      cls: Math.round(vitals.cls * 1000) / 1000,
      inp: round(vitals.inp),
      fcp: round(vitals.fcp),
      ttfb: nav ? Math.round(nav.responseStart) : null,
    });
  };
}

let listening = false;

/** Install the listeners once. Safe to call from every page. */
export function startTelemetry(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;

  document.addEventListener('click', onClick, { capture: true });

  let scheduled = false;
  window.addEventListener(
    'scroll',
    () => {
      if (scheduled || !page) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (page) page.maxScroll = Math.max(page.maxScroll, scrollDepth());
      });
    },
    { passive: true },
  );

  // visibilitychange is the reliable one on mobile; unload often never fires.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendVitals?.();
      sendEngagement();
      flush(true);
    } else if (page) {
      // Back on the tab: keep timing the same page as a new stretch.
      page = { ...page, visibleMs: 0, visibleSince: Date.now(), sent: false };
    }
  });
  window.addEventListener('pagehide', () => {
    sendVitals?.();
    sendEngagement();
    flush(true);
  });

  window.addEventListener('error', () => reportError('error'));
  window.addEventListener('unhandledrejection', () => reportError('promise'));

  observeVitals();
}
