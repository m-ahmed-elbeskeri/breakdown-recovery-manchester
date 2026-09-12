// Driving-distance & travel-time estimates for the tow journey (pickup → drop-off).
//
// Geocoding uses OpenStreetMap Nominatim and routing uses the public OSRM
// server — both free and keyless, which is fine for launch and low volume. For
// production scale, swap `geocode` / the OSRM call for a keyed provider
// (Mapbox, Google, OpenRouteService); nothing else in the app needs to change
// because everything depends only on `estimateJourney`.

import { BASE_LOCATION } from './config';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteEstimate {
  distanceMiles: number;
  durationMinutes: number;
}

const METERS_PER_MILE = 1609.344;

export const metersToMiles = (meters: number): number => meters / METERS_PER_MILE;
export const secondsToMinutes = (seconds: number): number => seconds / 60;

/** Pull coordinates out of a "Current location (53.4808, -2.2426)" style string. */
export function parseLatLng(text: string): LatLng | null {
  const match = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const geocodeCache = new Map<string, LatLng | null>();

async function geocode(query: string, signal?: AbortSignal): Promise<LatLng | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const cached = geocodeCache.get(key);
  if (cached !== undefined) return cached;

  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode failed (${res.status})`);
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  const hit = data[0];
  const result: LatLng | null = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  geocodeCache.set(key, result);
  return result;
}

/** Resolve free text (or an embedded "lat, lng") to coordinates. */
export async function resolveLocation(
  location: string,
  signal?: AbortSignal,
): Promise<LatLng | null> {
  return parseLatLng(location) ?? (await geocode(location, signal));
}

/** A place is either coordinates we already trust, or text still to resolve. */
export type Place = string | LatLng;

const asLatLng = (place: Place, signal?: AbortSignal): Promise<LatLng | null> =>
  typeof place === 'string' ? resolveLocation(place, signal) : Promise.resolve(place);

export interface JourneyEstimate {
  /** Loaded tow, pickup → drop-off. Zero for a job fixed at the roadside. */
  loadedMiles: number;
  loadedMinutes: number;
  /** Empty running: base → pickup. The drive home afterwards isn't charged. */
  deadheadMiles: number;
  deadheadMinutes: number;
}

/**
 * The truck movement a job is charged for, not just the towed leg: out from
 * base to the car, then the tow itself. Quoting only the loaded miles made a job
 * on the far edge of the patch look identical to one round the corner. The
 * drive home afterwards is not charged.
 *
 * OSRM returns a leg per waypoint pair, so the whole journey costs one request
 * rather than two — which matters on a public demo server.
 *
 * Returns `null` if a place can't be located or no route exists; throws only on
 * network/HTTP failure so callers can tell "no result" from "couldn't ask".
 */
export async function estimateJourney(
  pickup: Place,
  destination: Place | null,
  signal?: AbortSignal,
): Promise<JourneyEstimate | null> {
  const [base, from, to] = await Promise.all([
    resolveLocation(BASE_LOCATION, signal),
    asLatLng(pickup, signal),
    destination === null ? Promise.resolve(null) : asLatLng(destination, signal),
  ]);
  if (!base || !from) return null;
  if (destination !== null && !to) return null;

  // base → pickup [→ drop-off]
  const waypoints = to ? [base, from, to] : [base, from];
  const path = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=false`,
    { signal },
  );
  if (!res.ok) throw new Error(`routing failed (${res.status})`);
  const data = (await res.json()) as {
    routes?: Array<{ legs?: Array<{ distance: number; duration: number }> }>;
  };
  const legs = data.routes?.[0]?.legs;
  if (!legs || legs.length !== waypoints.length - 1) return null;

  // The first leg is always the empty run out; with a drop-off, the second is the tow.
  const empty = legs[0];
  const loaded = to ? legs[1] : null;

  return {
    loadedMiles: loaded ? Math.round(metersToMiles(loaded.distance) * 10) / 10 : 0,
    loadedMinutes: loaded ? Math.max(1, Math.round(secondsToMinutes(loaded.duration))) : 0,
    deadheadMiles: Math.round(metersToMiles(empty.distance) * 10) / 10,
    deadheadMinutes: Math.max(1, Math.round(secondsToMinutes(empty.duration))),
  };
}

// ── Place suggestions (autocomplete) ────────────────────────────────────────
//
// Deliberately NOT Nominatim: its usage policy bans autocomplete outright
// ("no per-keystroke querying"), and it enforces that by IP ban. Photon is
// Komoot's OSM geocoder, built for exactly this, free and keyless.
//
// Suggestions matter here beyond saving typing. A free-text drop-off is
// geocoded silently, so a mis-match ("Kwik Fit Bury" landing on the wrong
// branch) produces a confident price for the wrong journey and nobody notices
// until a truck is moving. Picking from a list makes the customer confirm the
// place, and hands us its exact coordinates so we never re-guess them.

const PHOTON_URL = 'https://photon.komoot.io/api/';
/** Roughly the UK, so a Manchester postcode doesn't match a German street. */
const UK_BBOX = '-8.65,49.86,1.77,60.86';
/** Bias results toward Greater Manchester — the service area. */
const BIAS = { lat: 53.4808, lon: -2.2426 };

export interface PlaceSuggestion {
  /** What the customer sees and what ends up in the input. */
  label: string;
  lat: number;
  lng: number;
}

interface PhotonProps {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
}

/** Build a human label: "Kwik Fit, 12 Bury New Rd, Prestwich, M25 0LD". */
export function formatSuggestion(p: PhotonProps): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  // District *and* city, not one or the other: Photon labels the Bury branch
  // of a chain with district "Fernhill", and a customer scanning the list is
  // looking for the town they know, not the ward it sits in.
  const parts = [p.name, street, p.district, p.city, p.postcode];
  // Drop blanks and any part that merely repeats an earlier one.
  const seen = new Set<string>();
  return parts
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

/**
 * Place suggestions for a partial query. Returns [] rather than throwing on a
 * failed lookup: autocomplete is an assist, and a customer at the roadside must
 * always be able to type free text and carry on.
 */
export async function suggestPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url =
    `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5&lang=en` +
    `&lat=${BIAS.lat}&lon=${BIAS.lon}&bbox=${UK_BBOX}`;
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: PhotonProps;
      }>;
    };
    const out: PlaceSuggestion[] = [];
    // Photon regularly returns the same place twice (separate OSM nodes for a
    // building and its entrance, say). Two identical rows in a dropdown read as
    // a bug, so collapse on the label the customer actually sees.
    const seenLabels = new Set<string>();
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      const props = f.properties;
      if (!coords || !props) continue;
      const [lng, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const label = formatSuggestion(props);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      seenLabels.add(label.toLowerCase());
      out.push({ label, lat, lng });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Motorway detection ──────────────────────────────────────────────────────
//
// Someone stranded on a motorway almost always says so — "M60 J17", "M62
// westbound", "hard shoulder". That is worth spotting, because a live
// carriageway is a different job: different safety procedure, National
// Highways involvement, and a surcharge every local operator applies.
//
// The trap is that Manchester postcodes are indistinguishable from motorway
// numbers at a glance. "M60 1AB" is a postcode in Prestwich; the depot itself
// is "M6 5UA". Charging someone £40 extra because their postcode starts with M
// would be indefensible, so a designation followed by a postcode's inward code
// (digit + two letters) is never treated as a road.

/** Motorways in and around Greater Manchester, plus the ones jobs run out to. */
const MOTORWAYS = new Set([
  'M6',
  'M56',
  'M60',
  'M61',
  'M62',
  'M65',
  'M66',
  'M67',
  'M602',
  'M1',
  'M5',
  'M40',
  'M42',
  'M53',
  'M55',
  'M57',
  'M58',
  'M180',
]);

/** Full UK postcode anywhere in the text, e.g. "M60 1AB" or "BL9 0NH". */
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

/**
 * The motorway a pickup sits on, or `null`. Returns the designation ("M60") so
 * the customer can be shown exactly what was detected rather than an
 * unexplained surcharge appearing on their quote.
 */
export function detectMotorway(text: string): string | null {
  if (!text) return null;
  // Blank out anything that is unambiguously a postcode first, so its outward
  // code can never be read as a road number.
  const cleaned = text.replace(POSTCODE, ' ');

  for (const match of cleaned.matchAll(/\bM\s?(\d{1,3})\b/gi)) {
    const designation = `M${match[1]}`;
    if (MOTORWAYS.has(designation.toUpperCase())) return designation.toUpperCase();
  }
  // No number, but the words are unambiguous on their own.
  if (/\b(motorway|hard shoulder)\b/i.test(cleaned)) return 'Motorway';
  return null;
}

/**
 * Motorway lookup for a coordinate, for the "Find Me" path where the customer
 * hands over GPS and never types a road name at all — precisely the person
 * least able to describe where they are. Best-effort: returns null on any
 * failure rather than throwing, since this only adjusts a price.
 */
export async function detectMotorwayAt(
  { lat, lng }: LatLng,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${PHOTON_URL.replace('/api/', '/reverse')}?lat=${lat}&lon=${lng}&limit=1`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ properties?: PhotonProps & { osm_value?: string } }>;
    };
    const props = data.features?.[0]?.properties;
    if (!props) return null;
    if (props.osm_value === 'motorway' || props.osm_value === 'motorway_link') {
      return detectMotorway(props.name ?? '') ?? 'Motorway';
    }
    return detectMotorway(props.name ?? '');
  } catch {
    return null;
  }
}
