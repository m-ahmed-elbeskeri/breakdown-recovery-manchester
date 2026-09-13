// The driver's side of the API: their application, their documents and their
// jobs. Every call carries the driver's own session, and the API only ever
// answers about that driver.

import { apiBlob, apiFetch, apiUpload } from './apiClient';
import type { Session } from './auth';
import type { DocumentInfo, DriverProfile, ProfilePatch } from './driverDocs';

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
  /** Null on a job that is not yours yet. */
  phone: string | null;
  service: string;
  timing: string;
  scheduledFor: string | null;
  vehicle: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  motorway: boolean;
  distanceMiles: number | null;
  durationMinutes: number | null;
  price: number | null;
  driverId: number | null;
  driverName: string | null;
  status: JobStatus;
  /** Admins only. */
  trackToken: string | null;
  createdAt: string;
  acceptedAt: string | null;
  enRouteAt: string | null;
  onSceneAt: string | null;
  finishedAt: string | null;
  cancelledBy: 'customer' | 'driver' | 'office' | null;
  rating: number | null;
  ratingComment: string | null;
}

export type JobStatus = 'pending' | 'accepted' | 'en_route' | 'on_scene' | 'complete' | 'cancelled';

/** The order a job moves through, and what the driver taps to advance it. */
export const NEXT_STATUS: Partial<Record<JobStatus, { next: JobStatus; label: string }>> = {
  pending: { next: 'accepted', label: 'Take this job' },
  accepted: { next: 'en_route', label: 'On my way' },
  en_route: { next: 'on_scene', label: "I'm on scene" },
  on_scene: { next: 'complete', label: 'Job done' },
};

// ── Applying and paperwork ──────────────────────────────────────────────────

export interface ApplyBody {
  name: string;
  email: string;
  phone: string;
  password: string;
  consent: boolean;
}

export const applyToDrive = (body: ApplyBody) =>
  apiFetch<Session>('/api/drivers/apply', { method: 'POST', json: body });

export const fetchMyProfile = () => apiFetch<DriverProfile>('/api/me/driver');

export const saveMyProfile = (patch: ProfilePatch) =>
  apiFetch<DriverProfile>('/api/me/driver/profile', { method: 'POST', json: patch });

export const submitMyApplication = () =>
  apiFetch<DriverProfile>('/api/me/driver/submit', { method: 'POST' });

export interface UploadMeta {
  docDate?: string | null;
  reference?: string | null;
  fileName?: string | null;
}

export const uploadMyDocument = (
  docType: string,
  file: Blob,
  meta: UploadMeta,
  onProgress?: (fraction: number) => void,
) =>
  apiUpload<DocumentInfo>(
    '/api/me/documents',
    file,
    { docType, docDate: meta.docDate, reference: meta.reference, fileName: meta.fileName },
    onProgress,
  );

export const deleteMyDocument = (id: number) =>
  apiFetch<void>(`/api/me/documents/${id}`, { method: 'DELETE' });

export const myDocumentFile = (id: number) => apiBlob(`/api/me/documents/${id}/file`);

// ── Working ─────────────────────────────────────────────────────────────────

export const fetchMyJobs = () => apiFetch<Job[]>('/api/me/jobs');

export interface StatePatch {
  available?: boolean;
  lat?: number;
  lng?: number;
  busyMinutes?: number;
}

export const setMyState = (patch: StatePatch) =>
  apiFetch<Driver>('/api/me/state', { method: 'POST', json: patch });

export const setMyJobStatus = (jobId: number, status: Exclude<JobStatus, 'cancelled'>) =>
  apiFetch<Job>(`/api/me/jobs/${jobId}/status`, { method: 'POST', json: { status } });

/**
 * How each status looks. Colour carries the state so a driver scanning the
 * list sees what needs doing without reading a word.
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
export function mapsUrl(job: Pick<Job, 'pickupLat' | 'pickupLng' | 'location'>): string {
  if (job.pickupLat !== null && job.pickupLng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${job.pickupLat},${job.pickupLng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`;
}

/** When the customer wants the truck: "ASAP", or "Sat 14 Sept, 09:30" for a booking. */
export function whenLabel(job: Pick<Job, 'timing' | 'scheduledFor'>): string {
  if (job.timing !== 'later') return 'ASAP';
  const at = job.scheduledFor ? new Date(job.scheduledFor) : null;
  if (!at || Number.isNaN(at.getTime())) return 'Scheduled · time not given';
  return at.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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

/**
 * Which jobs have appeared or changed hands since the last look. The console
 * polls; this is what turns a poll into an alert a driver in a cab notices.
 */
export function diffJobs(
  previous: Job[] | null,
  current: Job[],
  meId: number | null,
): { newWaiting: Job[]; cancelledOnMe: Job[] } {
  if (previous === null) return { newWaiting: [], cancelledOnMe: [] };
  const before = new Map(previous.map((j) => [j.id, j]));
  const newWaiting = current.filter(
    (j) => j.status === 'pending' && j.driverId === null && !before.has(j.id),
  );
  const cancelledOnMe = current.filter((j) => {
    const was = before.get(j.id);
    return (
      j.status === 'cancelled' &&
      j.cancelledBy !== 'driver' &&
      was !== undefined &&
      was.status !== 'cancelled' &&
      was.driverId === meId &&
      meId !== null
    );
  });
  return { newWaiting, cancelledOnMe };
}
