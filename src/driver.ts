// Driver-console API calls. Everything here is authenticated with the operator
// key and returns data the public site never sees — including other people's
// live coordinates, which is why none of it goes through `api.ts`.

import { API_BASE } from './api';

export const DRIVER_KEY_STORAGE = 'driver_api_key';

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  available: boolean;
  lat: number | null;
  lng: number | null;
  locatedAt: string | null;
  currentBookingId: number | null;
  busyUntil: string | null;
  busyMinutes: number;
}

export interface Job {
  id: number;
  region: string;
  location: string;
  destination: string | null;
  phone: string;
  service: string;
  timing: string;
  scheduledFor: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  motorway: boolean;
  distanceMiles: number | null;
  durationMinutes: number | null;
  price: number | null;
  driverId: number | null;
  status: JobStatus;
  createdAt: string;
}

export type JobStatus = 'pending' | 'accepted' | 'en_route' | 'on_scene' | 'complete' | 'cancelled';

/** The order a job moves through, and what the driver taps to advance it. */
export const NEXT_STATUS: Partial<Record<JobStatus, { next: JobStatus; label: string }>> = {
  pending: { next: 'accepted', label: 'Take this job' },
  accepted: { next: 'en_route', label: 'On my way' },
  en_route: { next: 'on_scene', label: "I'm on scene" },
  on_scene: { next: 'complete', label: 'Job done' },
};

async function call<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export const fetchDrivers = (key: string) => call<Driver[]>('/api/drivers', key);

export const fetchJobs = (key: string) => call<Job[]>('/api/bookings?limit=100', key);

export const setAvailability = (key: string, driverId: number, available: boolean) =>
  call<Driver>(`/api/drivers/${driverId}/state`, key, {
    method: 'POST',
    body: JSON.stringify({ available }),
  });

export const sendPosition = (key: string, driverId: number, lat: number, lng: number) =>
  call<Driver>(`/api/drivers/${driverId}/state`, key, {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });

/** Tell dispatch how much longer this driver expects to be. 0 clears it. */
export const setBusyMinutes = (key: string, driverId: number, busyMinutes: number) =>
  call<Driver>(`/api/drivers/${driverId}/state`, key, {
    method: 'POST',
    body: JSON.stringify({ busyMinutes }),
  });

export const setJobStatus = (key: string, jobId: number, status: JobStatus, driverId?: number) =>
  call<Job>(`/api/bookings/${jobId}/status`, key, {
    method: 'POST',
    body: JSON.stringify({ status, driverId }),
  });

export const deleteJob = (key: string, jobId: number) =>
  fetch(`${API_BASE}/api/bookings/${jobId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': key },
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status}`);
  });

/**
 * How each status looks. Colour carries the state so a driver scanning the
 * list sees what needs doing without reading a word: live work in hi-vis
 * yellow, finished work green and receded, anything cancelled greyed out.
 */
export const STATUS_STYLE: Record<JobStatus, { label: string; border: string; chip: string }> = {
  pending: {
    label: 'Waiting',
    border: 'border-neutral-700',
    chip: 'bg-neutral-800 text-neutral-300',
  },
  accepted: {
    label: 'Accepted',
    border: 'border-[var(--color-navy-400)]',
    chip: 'bg-[var(--color-navy-700)] text-white',
  },
  en_route: {
    label: 'On the way',
    border: 'border-yellow-400',
    chip: 'bg-yellow-400 text-neutral-950',
  },
  on_scene: {
    label: 'On scene',
    border: 'border-yellow-400',
    chip: 'bg-yellow-400 text-neutral-950',
  },
  complete: {
    label: 'Done',
    border: 'border-[var(--color-success)]',
    chip: 'bg-[var(--color-success)] text-white',
  },
  cancelled: {
    label: 'Cancelled',
    border: 'border-neutral-800',
    chip: 'bg-neutral-800 text-neutral-500',
  },
};

/** Google Maps link for a pickup — coordinates when we have them, else a search. */
export function mapsUrl(job: Job): string {
  if (job.pickupLat !== null && job.pickupLng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${job.pickupLat},${job.pickupLng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`;
}

/** "3 min ago" — how stale the position we last sent is. */
export function agoLabel(iso: string | null): string {
  if (!iso) return 'no position yet';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}
