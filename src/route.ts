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

/**
 * Driving distance + time from pickup to drop-off, or `null` if either place
 * can't be located or no route exists. Throws only on network/HTTP failure so
 * callers can distinguish "no result" from "couldn't reach the service".
 */
export async function estimateRoute(
  pickup: string,
  destination: string,
  signal?: AbortSignal,
): Promise<RouteEstimate | null> {
  const [from, to] = await Promise.all([
    resolveLocation(pickup, signal),
    resolveLocation(destination, signal),
  ]);
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
