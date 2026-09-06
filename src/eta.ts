// Live "how long until someone reaches you", asked of the backend.
//
// The answer comes back as minutes and a count of drivers on duty — never
// coordinates. Where the drivers actually are stays behind the authenticated
// endpoints; this is the public face of it.

import { API_BASE } from './api';

export interface EtaQuote {
  driversOnDuty: number;
  etaMinutes: number | null;
  /** Minutes of the job in front, already included in etaMinutes. */
  queueMinutes: number;
  /** `driver` = measured from a real position. `fallback` = the published average. */
  source: 'driver' | 'fallback';
}

/**
 * Ask what the wait is for a pickup. Returns `null` on any failure: an ETA is
 * an enhancement to the booking flow, never a gate in front of it.
 */
export async function fetchEta(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<EtaQuote | null> {
  try {
    const res = await fetch(`${API_BASE}/api/eta?lat=${lat}&lng=${lng}`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as EtaQuote;
  } catch {
    return null;
  }
}
