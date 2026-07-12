import { useEffect } from 'react';
import { API_BASE } from './api';

export interface BookingArgs {
  region: string;
  location: string;
  destination?: string;
  phone: string;
  service: string;
  timing: 'now' | 'later';
  scheduledFor?: string;
  /** Estimated tow distance (pickup → drop-off), when a destination is given. */
  distanceMiles?: number;
  /** Estimated tow driving time in minutes. */
  durationMinutes?: number;
  /** Indicative quoted price shown to the customer (in £). */
  price?: number;
}

/** A booking with the client-generated idempotency key attached. */
export type BookingPayload = BookingArgs & { requestId: string };

export interface BookingResult {
  ok: boolean;
  eta: number;
  mode: 'api' | 'local';
}

/** Sends a booking to the backend. Injected so the queue logic is testable. */
export type PostBooking = (payload: BookingPayload) => Promise<{ eta?: number }>;

const FALLBACK_KEY = 'pending_bookings_v1';
const SUBMIT_TIMEOUT_MS = 4000;
const DEFAULT_ETA = 24;

const newRequestId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/** POST a booking to the FastAPI backend. */
const postBooking: PostBooking = async (payload) => {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`booking failed (${res.status})`);
  return (await res.json()) as { eta?: number };
};

/** Read the queue of bookings awaiting delivery to the backend. */
export const readPending = (): BookingPayload[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writePending = (items: BookingPayload[]): void => {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    /* localStorage unavailable (private mode etc.) */
  }
};

const persistLocally = (payload: BookingPayload): void => {
  writePending([...readPending(), payload]);
};

const etaOf = (result: unknown): number => (result as { eta?: number } | null)?.eta ?? DEFAULT_ETA;

const submitWithTimeout = (
  post: PostBooking,
  payload: BookingPayload,
  timeoutMs: number,
): Promise<unknown> =>
  Promise.race([
    post(payload),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);

interface SubmitOptions {
  /** Override the generated idempotency key (useful for tests). */
  requestId?: string;
  timeoutMs?: number;
}

/**
 * Submit a booking to the backend. On any failure (including a client-side
 * timeout) the booking is queued in localStorage keyed by a stable `requestId`.
 * Because the backend is idempotent on `requestId`, a later flush of that queue
 * cannot create a duplicate even if the original request actually committed
 * after the timeout.
 *
 * Exported (not just the hook) so the queue/timeout/idempotency behaviour can be
 * unit-tested directly.
 */
export async function submitBooking(
  post: PostBooking,
  args: BookingArgs,
  options: SubmitOptions = {},
): Promise<BookingResult> {
  const timeoutMs = options.timeoutMs ?? SUBMIT_TIMEOUT_MS;
  const payload: BookingPayload = { ...args, requestId: options.requestId ?? newRequestId() };

  try {
    const result = await submitWithTimeout(post, payload, timeoutMs);
    return { ok: true, eta: etaOf(result), mode: 'api' };
  } catch (err) {
    console.warn('[booking] API submit failed, queued for retry:', err);
    persistLocally(payload);
    return { ok: true, eta: DEFAULT_ETA, mode: 'local' };
  }
}

/** Re-send queued bookings; each is removed only once the backend confirms it. */
export async function flushPending(post: PostBooking): Promise<void> {
  const pending = readPending();
  if (pending.length === 0) return;

  const remaining: BookingPayload[] = [];
  for (const payload of pending) {
    try {
      await post(payload);
    } catch {
      remaining.push(payload); // keep for the next attempt
    }
  }
  writePending(remaining);
}

export function useSubmitBooking(): (args: BookingArgs) => Promise<BookingResult> {
  // Flush anything queued from a previous failed/offline attempt.
  useEffect(() => {
    void flushPending(postBooking);
  }, []);

  return (args: BookingArgs) => submitBooking(postBooking, args);
}
