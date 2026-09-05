// Driving-distance & travel-time estimates for the tow journey (pickup → drop-off).
//
// Geocoding uses OpenStreetMap Nominatim and routing uses the public OSRM
// server — both free and keyless, which is fine for launch and low volume. For
// production scale, swap `geocode` / the OSRM call for a keyed provider
// (Mapbox, Google, OpenRouteService); nothing else in the app needs to change
// because everything depends only on `estimateRoute`.

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

/**
 * Driving distance + time from pickup to drop-off, or `null` if either place
 * can't be located or no route exists. Throws only on network/HTTP failure so
 * callers can distinguish "no result" from "couldn't reach the service".
 */
export async function estimateRoute(
  pickup: Place,
  destination: Place,
  signal?: AbortSignal,
): Promise<RouteEstimate | null> {
  const [from, to] = await Promise.all([asLatLng(pickup, signal), asLatLng(destination, signal)]);
  if (!from || !to) return null;

  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`routing failed (${res.status})`);
  const data = (await res.json()) as {
    routes?: Array<{ distance: number; duration: number }>;
  };
  const route = data.routes?.[0];
  if (!route) return null;

  return {
    distanceMiles: Math.round(metersToMiles(route.distance) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(secondsToMinutes(route.duration))),
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
