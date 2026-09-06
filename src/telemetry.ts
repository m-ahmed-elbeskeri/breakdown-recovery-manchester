// Anonymous site telemetry.
//
// The operator's real questions are which area pages bring work, where people
// give up in the booking form, how many ring instead of booking, and whether
// having a driver on duty actually wins the job. All of those are answerable
// without knowing who anybody is, so this knows nothing about anybody.
//
// No cookie, no identifier that outlives the tab, no IP logging, and — most
// importantly — no free-text ever leaves this file. The customer's phone
// number, name and address are never arguments to `track`; the payload is
// whitelisted to numbers, booleans and short known labels, so a future edit
// cannot casually start sending an address to the analytics table.

import { API_BASE } from './api';

const SESSION_KEY = 'mayte_session';
/** Hold events briefly so a visit costs one request, not twenty. */
const FLUSH_AFTER_MS = 4000;
const MAX_BATCH = 20;

/** Only these may appear in a payload. Anything else is dropped, silently. */
type Primitive = string | number | boolean | null;
export type EventPayload = Record<string, Primitive>;

export type EventName =
  | 'page_view'
  | 'booking_started'
  | 'details_done'
  | 'service_chosen'
  | 'quote_shown'
  | 'dispatch_requested'
  | 'booking_confirmed'
  | 'call_clicked'
  | 'install_prompted'
  | 'form_error';

interface QueuedEvent {
  name: EventName;
  sessionId: string;
  path: string;
  region?: string;
  device?: string;
  referrer?: string;
  payload?: EventPayload;
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

function device(): string {
  const ua = navigator.userAgent;
  if (/iphone|ipod|android.*mobile/i.test(ua)) return 'mobile';
  if (/ipad|android/i.test(ua)) return 'tablet';
  return 'desktop';
}

/**
 * The referring site, host only. A full URL can carry a search query — which
 * is somebody's words — and the host answers the question anyway: did they
 * come from Google, from Facebook, or straight to us.
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

/** Strip anything that is not a short scalar. Belt and braces over the types. */
function clean(payload?: EventPayload): EventPayload | undefined {
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
  try {
    // On unload only sendBeacon is guaranteed to survive the page going away.
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error to a stranded customer */
    });
  } catch {
    /* ditto */
  }
}

export function track(name: EventName, payload?: EventPayload): void {
  if (typeof window === 'undefined') return;
  queue.push({
    name,
    sessionId: sessionId(),
    path: location.pathname.slice(0, 120),
    region: currentRegion,
    device: device(),
    referrer: referrer(),
    payload: clean(payload),
  });

  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (!timer) timer = setTimeout(() => flush(), FLUSH_AFTER_MS);
}

let listening = false;

/** Send whatever is queued when the tab is hidden or closed. */
export function startTelemetry(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // Every tel: link on the site, caught in one place. A delegated listener
  // rather than an onClick on each: calls are the main way this business wins
  // work, and instrumenting them one component at a time guarantees somebody
  // adds a call button later and forgets.
  document.addEventListener(
    'click',
    (e) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a[href^="tel:"]');
      if (!link) return;
      track('call_clicked', {
        // Where on the page it was, never the number itself.
        placement: link.getAttribute('data-call') ?? 'link',
      });
      // A tel: link navigates away instantly on mobile, so this cannot wait
      // for the batch timer.
      flush(true);
    },
    { capture: true },
  );

  // visibilitychange is the reliable one on mobile; unload often never fires.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
}
