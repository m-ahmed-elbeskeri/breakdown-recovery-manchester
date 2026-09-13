import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseLatLng,
  metersToMiles,
  secondsToMinutes,
  estimateJourney,
  detectMotorway,
  detectMotorwayAt,
  postcodeOutward,
  suggestPlaces,
} from './route';

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
   * Routes OSRM calls to `legs`, and any geocode (the base is a full postcode,
   * so it resolves through postcodes.io; free text goes to Nominatim) to a
   * fixed depot coordinate.
   */
  const mockFetch = (legs: Array<{ distance: number; duration: number }> | null) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('postcodes.io')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ result: { latitude: 53.4864, longitude: -2.2814 } }),
          });
        }
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

  it('splits a tow into the empty run out and the loaded leg, with no drive home', async () => {
    mockFetch([
      { distance: 10000, duration: 600 }, // base → pickup, empty
      { distance: 24832.4, duration: 1447.8 }, // pickup → drop-off, loaded
    ]);

    const result = await estimateJourney('53.4772, -2.2309', '53.5768, -2.4282');

    expect(result).toEqual({
      loadedMiles: 15.4,
      loadedMinutes: 24,
      deadheadMiles: 6.2, // 10 km out
      deadheadMinutes: 10,
    });
  });

  it('counts only the drive out as empty running for a roadside job', async () => {
    mockFetch([
      { distance: 16093.44, duration: 900 }, // base → pickup
    ]);

    const result = await estimateJourney('53.4772, -2.2309', null);

    expect(result).toEqual({
      loadedMiles: 0,
      loadedMinutes: 0,
      deadheadMiles: 10,
      deadheadMinutes: 15,
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
      vi.fn().mockImplementation((url: string) =>
        url.includes('postcodes.io')
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ result: { latitude: 53.4864, longitude: -2.2814 } }),
            })
          : url.includes('nominatim')
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
    ]);

    const result = await estimateJourney('53.47, -2.23', '53.471, -2.231');
    expect(result?.loadedMinutes).toBe(1);
    expect(result?.deadheadMinutes).toBe(1);
  });
});

describe('postcodeOutward', () => {
  it('reads the outward code from a full or partial postcode', () => {
    expect(postcodeOutward('M22')).toBe('M22');
    expect(postcodeOutward('m22 4ea')).toBe('M22');
    expect(postcodeOutward('DH6 5JQ')).toBe('DH6');
  });

  it('ignores text that is not just a postcode', () => {
    expect(postcodeOutward('Manchester Airport')).toBeNull();
    expect(postcodeOutward('M60 J17')).toBeNull();
  });
});

describe('suggestPlaces', () => {
  afterEach(() => vi.unstubAllGlobals());

  const feature = (lat: number, lng: number, properties: Record<string, string>) => ({
    geometry: { coordinates: [lng, lat] },
    properties,
  });

  const mockPhoton = (features: unknown[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features }) }),
    );

  it('never offers a lamp post that happens to share the postcode', async () => {
    mockPhoton([
      feature(52.976, -1.988, {
        osm_key: 'highway',
        osm_value: 'street_lamp',
        name: 'M22',
        street: 'Tean Road',
        city: 'Cheadle',
      }),
      feature(53.411, -2.263, { osm_key: 'place', osm_value: 'postcode', postcode: 'M22 4EA' }),
    ]);

    const results = await suggestPlaces('M22');
    expect(results.map((r) => r.label)).toEqual(['M22 4EA']);
  });

  it('lists places in the typed postcode ahead of lookalikes', async () => {
    mockPhoton([
      feature(52.0, -1.0, {
        osm_key: 'amenity',
        osm_value: 'shop',
        name: 'M22 Motors',
        city: 'Leeds',
      }),
      feature(53.4, -2.26, { osm_key: 'place', osm_value: 'postcode', postcode: 'M22 4AN' }),
      feature(53.39, -2.2, { osm_key: 'place', osm_value: 'postcode', postcode: 'M2 2AA' }),
    ]);

    const results = await suggestPlaces('M22');
    expect(results[0].label).toBe('M22 4AN');
  });
});

describe('geocoding a bare postcode district', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('looks up "M22" as a postcode district, not as free text', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('postcodes.io')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ result: { latitude: 53.3857, longitude: -2.2601 } }),
        });
      }
      if (url.includes('nominatim')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '53.4839', lon: '-2.3078' }],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ routes: [{ legs: [{ distance: 16093.44, duration: 900 }] }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await estimateJourney('M22', null);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('postcodes.io/outcodes/M22'))).toBe(true);
    expect(urls.some((u) => u.includes('nominatim') && u.includes('M22'))).toBe(false);
    expect(urls.find((u) => u.includes('router.project-osrm.org'))).toContain('-2.2601,53.3857');
  });

  it('finds no place for a district that does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          url.includes('postcodes.io')
            ? Promise.resolve({ ok: false, status: 404 })
            : Promise.resolve({ ok: true, json: async () => [{ lat: '53.4839', lon: '-2.3078' }] }),
        ),
    );
    expect(await estimateJourney('ZZ9', null)).toBeNull();
  });
});

describe('geocoding a full postcode', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Nominatim answered "M1 1AA" with the M1 motorway in Leicestershire and
  // priced a city-centre jump start as a 130-mile run. Royal Mail data knows
  // where every postcode is; the general geocoder is never asked.
  it('asks postcodes.io for "M1 1AA" and never Nominatim', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('postcodes.io/postcodes/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ result: { latitude: 53.487378, longitude: -2.227194 } }),
        });
      }
      if (url.includes('nominatim')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '52.4135', lon: '-1.1829' }],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ routes: [{ legs: [{ distance: 4000, duration: 600 }] }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await estimateJourney('M1 1AA', null);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('postcodes.io/postcodes/M1%201AA'))).toBe(true);
    expect(urls.some((u) => u.includes('nominatim') && u.includes('1AA'))).toBe(false);
    expect(urls.find((u) => u.includes('router.project-osrm.org'))).toContain(
      '-2.227194,53.487378',
    );
  });

  it('treats a postcode Royal Mail has never heard of as no place at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: string) =>
          url.includes('postcodes.io')
            ? Promise.resolve({ ok: false, status: 404 })
            : Promise.resolve({ ok: true, json: async () => [{ lat: '52.4135', lon: '-1.1829' }] }),
        ),
    );
    expect(await estimateJourney('ZZ9 9ZZ', null)).toBeNull();
  });

  it('falls back to the general geocoder only when the postcode service is down', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('postcodes.io/postcodes/')) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      if (url.includes('postcodes.io/outcodes/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ result: { latitude: 53.4864, longitude: -2.2814 } }),
        });
      }
      if (url.includes('nominatim')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '53.4873', lon: '-2.2271' }],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ routes: [{ legs: [{ distance: 4000, duration: 600 }] }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await estimateJourney('M4 4BB', null);

    expect(result).not.toBeNull();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('nominatim') && u.includes('4BB'))).toBe(true);
  });
});

describe('detectMotorwayAt', () => {
  afterEach(() => vi.unstubAllGlobals());

  const overpass = (elements: unknown[]) =>
    Promise.resolve({ ok: true, json: async () => ({ elements }) });

  it('names the motorway a pin sits on', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValue(overpass([{ tags: { highway: 'motorway', ref: 'M60;A580' } }]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await detectMotorwayAt({ lat: 53.5354, lng: -2.3075 })).toBe('M60');
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass');
  });

  it('trusts a confirmed "no motorway here" without asking anyone else', async () => {
    const fetchMock = vi.fn().mockReturnValue(overpass([]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await detectMotorwayAt({ lat: 53.4111, lng: -2.2627 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries the second server, then the old lookup, when Overpass is down', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('overpass')
        ? Promise.resolve({ ok: false, status: 429 })
        : Promise.resolve({
            ok: true,
            json: async () => ({
              features: [{ properties: { osm_value: 'motorway', name: 'M62' } }],
            }),
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await detectMotorwayAt({ lat: 53.6, lng: -2.1 })).toBe('M62');
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.includes('overpass'))).toHaveLength(2);
    expect(urls.some((u) => u.includes('photon'))).toBe(true);
  });
});

describe('detectMotorway', () => {
  it('spots how a stranded driver actually describes a motorway', () => {
    expect(detectMotorway('M60 J17')).toBe('M60');
    expect(detectMotorway('M62 westbound near junction 12')).toBe('M62');
    expect(detectMotorway('broken down on the M6 southbound')).toBe('M6');
    expect(detectMotorway('hard shoulder, not sure where')).toBe('Motorway');
  });

  it('does NOT mistake a Manchester postcode for a motorway', () => {
    // The whole trap: M-postcodes and motorway numbers look identical.
    expect(detectMotorway('M60 1AB')).toBeNull();
    expect(detectMotorway('M6 5UA')).toBeNull(); // the depot's own postcode
    expect(detectMotorway('12 Deansgate, Manchester, M3 3WD')).toBeNull();
    expect(detectMotorway('Kwik Fit, John Street, Bury, BL9 0NH')).toBeNull();
  });

  it('reads the road when a postcode sits alongside it', () => {
    expect(detectMotorway('M60 J17, near M25 3AB')).toBe('M60');
  });

  it('ignores ordinary addresses and unknown M-roads', () => {
    expect(detectMotorway('Piccadilly Gardens')).toBeNull();
    expect(detectMotorway('')).toBeNull();
    expect(detectMotorway('M999 industrial estate')).toBeNull();
  });
});
