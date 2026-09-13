// The customer's live tracking page: what the API tells them, and what each
// status means in words they can act on.
//
// Everything here is keyed by the booking's own token. The API returns the
// assigned driver's position only while they are on the way, so nothing in
// this file needs to decide what to hide — it only has to show what it is
// given.

import { API_BASE } from './api';

export type TrackStatus =
  'pending' | 'accepted' | 'en_route' | 'on_scene' | 'complete' | 'cancelled';

export interface TrackDriver {
  name: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  locatedAt: string | null;
}

export interface TrackInfo {
  id: number;
  status: TrackStatus;
  service: string;
  timing: string;
  scheduledFor: string | null;
  location: string;
  destination: string | null;
  vehicle: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  price: number | null;
  motorway: boolean;
  etaMinutes: number | null;
  etaSource: 'driver' | 'fallback';
  driversOnDuty: number;
  driver: TrackDriver | null;
  createdAt: string;
  acceptedAt: string | null;
  enRouteAt: string | null;
  onSceneAt: string | null;
  finishedAt: string | null;
  cancelledBy: 'customer' | 'driver' | null;
  rating: number | null;
  canCancel: boolean;
}

export class TrackError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* no body */
    }
    throw new TrackError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const fetchTrack = (token: string, signal?: AbortSignal) =>
  call<TrackInfo>(`/api/track/${encodeURIComponent(token)}`, { signal });

export const cancelTrack = (token: string) =>
  call<TrackInfo>(`/api/track/${encodeURIComponent(token)}/cancel`, { method: 'POST' });

export const rateTrack = (token: string, rating: number, comment: string) =>
  call<TrackInfo>(`/api/track/${encodeURIComponent(token)}/rating`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment: comment.trim() || null }),
  });

/** The journey a job takes, in the order the customer sees it. */
export const TRACK_STEPS: { status: TrackStatus; label: string }[] = [
  { status: 'pending', label: 'Request received' },
  { status: 'accepted', label: 'Driver assigned' },
  { status: 'en_route', label: 'On the way' },
  { status: 'on_scene', label: 'With you' },
  { status: 'complete', label: 'Done' },
];

/** How far along the steps a status is; -1 for a cancelled job. */
export function stepIndex(status: TrackStatus): number {
  return TRACK_STEPS.findIndex((s) => s.status === status);
}

/** The one-line headline for a status, written for someone at the roadside. */
export function headlineFor(info: TrackInfo): string {
  switch (info.status) {
    case 'pending':
      return info.timing === 'later' ? 'Booking received' : 'Finding your driver';
    case 'accepted':
      return info.driver ? `${firstName(info.driver.name)} has your job` : 'Driver assigned';
    case 'en_route':
      return info.driver ? `${firstName(info.driver.name)} is on the way` : 'Driver on the way';
    case 'on_scene':
      return 'Your driver is with you';
    case 'complete':
      return 'Job done';
    case 'cancelled':
      return info.cancelledBy === 'customer' ? 'Booking cancelled' : 'We had to cancel';
  }
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** "3 min ago" for a driver's last reported position. */
export function agoLabel(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
}
