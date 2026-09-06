// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  submitBooking,
  flushPending,
  readPending,
  type BookingArgs,
  type BookingPayload,
} from './useBackend';

const args: BookingArgs = {
  region: 'Manchester',
  location: 'M1 1AA',
  phone: '07700900123',
  service: 'towing',
  timing: 'now',
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('submitBooking', () => {
  it('returns the backend eta and queues nothing on success', async () => {
    const post = vi.fn().mockResolvedValue({ eta: 18 });

    const result = await submitBooking(post, args, { requestId: 'r1' });

    // etaSource defaults to 'fallback': this stub returns only an eta, and an
    // ETA of unknown provenance must never be taken for a measured one.
    expect(result).toEqual({ ok: true, eta: 18, etaSource: 'fallback', mode: 'api' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(readPending()).toEqual([]);
  });

  it('queues the booking (keyed by requestId) when the backend rejects', async () => {
    const post = vi.fn().mockRejectedValue(new Error('network'));

    const result = await submitBooking(post, args, { requestId: 'r2' });

    expect(result.mode).toBe('local');
    const queued = readPending();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ requestId: 'r2', location: 'M1 1AA' });
  });

  it('queues the booking when the backend does not respond before the timeout', async () => {
    vi.useFakeTimers();
    const post = vi.fn(() => new Promise<never>(() => {})); // never resolves

    const pending = submitBooking(post, args, { requestId: 'r3', timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;

    expect(result.mode).toBe('local');
    expect(readPending()).toHaveLength(1);
  });
});

describe('flushPending', () => {
  const seed = (payloads: BookingPayload[]) =>
    localStorage.setItem('pending_bookings_v1', JSON.stringify(payloads));

  const payload = (requestId: string): BookingPayload => ({ ...args, requestId });

  it('re-sends queued bookings and clears them once confirmed', async () => {
    seed([payload('a'), payload('b')]);
    const post = vi.fn().mockResolvedValue({ eta: 24 });

    await flushPending(post);

    expect(post).toHaveBeenCalledTimes(2);
    expect(readPending()).toEqual([]);
  });

  it('keeps bookings that still fail, so no dispatch is silently lost', async () => {
    seed([payload('a'), payload('b')]);
    const post = vi
      .fn()
      .mockResolvedValueOnce({ eta: 24 }) // 'a' succeeds
      .mockRejectedValueOnce(new Error('still offline')); // 'b' fails

    await flushPending(post);

    const remaining = readPending();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.requestId).toBe('b');
  });

  it('is a no-op when the queue is empty', async () => {
    const post = vi.fn();
    await flushPending(post);
    expect(post).not.toHaveBeenCalled();
  });

  it('re-sends with the original requestId so the backend can dedupe a late commit', async () => {
    seed([payload('dup-key')]);
    const post = vi.fn().mockResolvedValue({ eta: 24 });

    await flushPending(post);

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'dup-key' }));
  });
});

describe('submitBooking — where the ETA came from', () => {
  it('passes through a measured ETA so the screen may claim a dispatch', async () => {
    const post = vi.fn().mockResolvedValue({ eta: 11, etaSource: 'driver' });
    const result = await submitBooking(post, args, { requestId: 'r-src-1' });
    expect(result.etaSource).toBe('driver');
  });

  it('reports a queued booking as unmeasured', async () => {
    // It never reached the server, so nobody has been dispatched.
    const post = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await submitBooking(post, args, { requestId: 'r-src-2' });
    expect(result.mode).toBe('local');
    expect(result.etaSource).toBe('fallback');
  });
});
