import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLatLng, metersToMiles, secondsToMinutes, estimateJourney } from './route';

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

describe('estimateJourney', () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Routes OSRM calls to `legs`, and any geocode (the base postcode is text, so
   * it always resolves through Nominatim) to a fixed depot coordinate.
   */
  const mockFetch = (legs: Array<{ distance: number; duration: number }> | null) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('nominatim')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ lat: '53.4839', lon: '-2.3078' }],
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ routes: legs ? [{ legs }] : [] }),
        });
      }),
    );

  it('splits a tow into its loaded leg and the empty running either side', async () => {
    mockFetch([
      { distance: 10000, duration: 600 }, // base → pickup, empty
      { distance: 24832.4, duration: 1447.8 }, // pickup → drop-off, loaded
      { distance: 9000, duration: 540 }, // drop-off → base, empty
    ]);

    const result = await estimateJourney('53.4772, -2.2309', '53.5768, -2.4282');

    expect(result).toEqual({
      loadedMiles: 15.4,
      loadedMinutes: 24,
      deadheadMiles: 11.8, // 19 km out and back
      deadheadMinutes: 19,
    });
  });

  it('counts every leg as empty running for a roadside job', async () => {
    mockFetch([
      { distance: 16093.44, duration: 900 }, // base → pickup
      { distance: 16093.44, duration: 900 }, // pickup → base
    ]);

    const result = await estimateJourney('53.4772, -2.2309', null);

    expect(result).toEqual({
      loadedMiles: 0,
      loadedMinutes: 0,
      deadheadMiles: 20,
      deadheadMinutes: 30,
    });
  });

  it('returns null when no route is found', async () => {
    mockFetch(null);
    expect(await estimateJourney('53.47, -2.23', '53.57, -2.42')).toBeNull();
  });

  it('returns null when the leg count does not match the waypoints', async () => {
    mockFetch([{ distance: 100, duration: 60 }]);
    expect(await estimateJourney('53.47, -2.23', '53.57, -2.42')).toBeNull();
  });

  it('throws on an HTTP error so callers can show a fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          url.includes('nominatim')
            ? Promise.resolve({ ok: true, json: async () => [{ lat: '53.4839', lon: '-2.3078' }] })
            : Promise.resolve({ ok: false, status: 503 }),
        ),
    );

    await expect(estimateJourney('53.47, -2.23', '53.57, -2.42')).rejects.toThrow(/routing failed/);
  });

  it('never reports a duration below one minute', async () => {
    mockFetch([
      { distance: 120, duration: 20 },
      { distance: 120, duration: 20 },
      { distance: 120, duration: 20 },
    ]);

    const result = await estimateJourney('53.47, -2.23', '53.471, -2.231');
    expect(result?.loadedMinutes).toBe(1);
    expect(result?.deadheadMinutes).toBe(1);
  });
});
