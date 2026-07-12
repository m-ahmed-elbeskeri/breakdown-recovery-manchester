import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLatLng, metersToMiles, secondsToMinutes, estimateRoute } from './route';

describe('parseLatLng', () => {
  it('extracts coordinates from a "Current location (...)" string', () => {
    expect(parseLatLng('Current location (53.4808, -2.2426)')).toEqual({
      lat: 53.4808,
      lng: -2.2426,
    });
  });

  it('parses a bare "lat, lng" pair', () => {
    expect(parseLatLng('53.48, -2.24')).toEqual({ lat: 53.48, lng: -2.24 });
  });

  it('returns null for a plain address / postcode', () => {
    expect(parseLatLng('M1 1AA, Manchester')).toBeNull();
    expect(parseLatLng('Bolton town centre')).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseLatLng('120.0, 200.0')).toBeNull();
  });
});

describe('unit conversions', () => {
  it('converts metres to miles', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
    expect(metersToMiles(24832.4)).toBeCloseTo(15.43, 1);
  });

  it('converts seconds to minutes', () => {
    expect(secondsToMinutes(1447.8)).toBeCloseTo(24.13, 1);
  });
});

describe('estimateRoute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns rounded miles + minutes from the routing response', async () => {
    // Both inputs are coordinates, so only the OSRM call is made.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [{ distance: 24832.4, duration: 1447.8 }] }),
      }),
    );

    const result = await estimateRoute('53.4772, -2.2309', '53.5768, -2.4282');

    expect(result).toEqual({ distanceMiles: 15.4, durationMinutes: 24 });
  });

  it('returns null when no route is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }),
    );

    expect(await estimateRoute('53.47, -2.23', '53.57, -2.42')).toBeNull();
  });

  it('throws on an HTTP error so callers can show a fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(estimateRoute('53.47, -2.23', '53.57, -2.42')).rejects.toThrow(/routing failed/);
  });

  it('never routes a duration below one minute', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [{ distance: 120, duration: 20 }] }),
      }),
    );

    const result = await estimateRoute('53.47, -2.23', '53.471, -2.231');
    expect(result?.durationMinutes).toBe(1);
  });
});
