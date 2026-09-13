// The office's side of the API. Every call needs an admin session.

import { apiBlob, apiFetch, apiUpload } from './apiClient';
import type { User } from './auth';
import type { Driver, Job, JobStatus } from './driver';
import { DOC_TYPE_BY_KEY, formatDate } from './driverDocs';
import type { DocumentInfo, DriverProfile, ProfilePatch } from './driverDocs';

export interface DriverSummary {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: DriverProfile['status'];
  active: boolean;
  available: boolean;
  hasAccount: boolean;
  lastLoginAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  vehicleReg: string | null;
  vehicleType: string | null;
  vehicleGvwKg: number | null;
  motorwayWork: boolean;
  pendingDocs: number;
  missingDocs: number;
  expiringDocs: number;
  expiredDocs: number;
  canWork: boolean;
}

export interface AuditEvent {
  id: number;
  createdAt: string;
  actorUserId: number | null;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  detail: Record<string, unknown> | null;
}

export interface AdminDriverDetail {
  profile: DriverProfile;
  history: DocumentInfo[];
  audit: AuditEvent[];
}

export interface ComplianceRow {
  driverId: number;
  driverName: string;
  driverStatus: string;
  key: string;
  label: string;
  state: string;
  validUntil: string | null;
  blocksWork: boolean;
}

export interface Invite {
  userId: number;
  driverId: number | null;
  setupPath: string;
  expiresAt: string;
}

export type Decision = 'approve' | 'reject' | 'suspend' | 'reinstate';

export const listDriverSummaries = (status?: string) =>
  apiFetch<DriverSummary[]>(`/api/admin/drivers${status ? `?status=${status}` : ''}`);

export const fetchDriverDetail = (id: number) =>
  apiFetch<AdminDriverDetail>(`/api/admin/drivers/${id}`);

export const updateDriverProfile = (id: number, patch: ProfilePatch) =>
  apiFetch<AdminDriverDetail>(`/api/admin/drivers/${id}/profile`, { method: 'POST', json: patch });

export const submitForDriver = (id: number) =>
  apiFetch<AdminDriverDetail>(`/api/admin/drivers/${id}/submit`, { method: 'POST' });

export const decideDriver = (id: number, decision: Decision, note?: string) =>
  apiFetch<AdminDriverDetail>(`/api/admin/drivers/${id}/decision`, {
    method: 'POST',
    json: { decision, note: note?.trim() || null },
  });

export const reviewDocument = (
  documentId: number,
  body: { decision: 'approve' | 'reject'; reason?: string; docDate?: string | null; reference?: string | null },
) =>
  apiFetch<AdminDriverDetail>(`/api/admin/documents/${documentId}/review`, {
    method: 'POST',
    json: body,
  });

export const documentFile = (documentId: number) =>
  apiBlob(`/api/admin/documents/${documentId}/file`);

export const uploadForDriver = (
  driverId: number,
  docType: string,
  file: Blob,
  meta: { docDate?: string | null; reference?: string | null; fileName?: string | null },
  onProgress?: (fraction: number) => void,
) =>
  apiUpload<DocumentInfo>(
    `/api/admin/drivers/${driverId}/documents`,
    file,
    { docType, docDate: meta.docDate, reference: meta.reference, fileName: meta.fileName },
    onProgress,
  );

export const inviteDriver = (body: { name: string; email: string; phone?: string }) =>
  apiFetch<Invite>('/api/admin/drivers/invite', { method: 'POST', json: body });

export const linkDriverAccount = (driverId: number, email: string) =>
  apiFetch<Invite>(`/api/admin/drivers/${driverId}/account`, { method: 'POST', json: { email } });

export const fetchComplianceReport = () => apiFetch<ComplianceRow[]>('/api/admin/compliance');

export const fetchAudit = (limit = 100, beforeId?: number) =>
  apiFetch<AuditEvent[]>(`/api/admin/audit?limit=${limit}${beforeId ? `&before_id=${beforeId}` : ''}`);

export const listAdmins = () => apiFetch<User[]>('/api/admin/users');

export const createAdmin = (body: { name: string; email: string }) =>
  apiFetch<Invite>('/api/admin/users', { method: 'POST', json: body });

export const createResetLink = (userId: number) =>
  apiFetch<Invite>(`/api/admin/users/${userId}/reset-link`, { method: 'POST' });

export const setUserActive = (userId: number, active: boolean) =>
  apiFetch<User>(`/api/admin/users/${userId}/active`, { method: 'POST', json: { active } });

// ── Dispatch ────────────────────────────────────────────────────────────────

export const fetchBookings = (limit = 100) => apiFetch<Job[]>(`/api/bookings?limit=${limit}`);

export const fetchRoster = () => apiFetch<Driver[]>('/api/drivers');

export const assignJob = (jobId: number, status: JobStatus, driverId?: number) =>
  apiFetch<Job>(`/api/bookings/${jobId}/status`, { method: 'POST', json: { status, driverId } });

export const removeDriver = (driverId: number) =>
  apiFetch<void>(`/api/drivers/${driverId}`, { method: 'DELETE' });

/** A full link from a path the API returned, on whatever address this page is served from. */
export const absoluteLink = (path: string): string => `${window.location.origin}${path}`;

/** Readable wording for audit actions. */
export const ACTION_LABEL: Record<string, string> = {
  'account.admin_created': 'Created the first admin account',
  'account.admin_invited': 'Invited an admin',
  'account.signed_in': 'Signed in',
  'account.signed_out_everywhere': 'Signed out on every device',
  'account.locked': 'Account locked after failed sign-ins',
  'account.password_changed': 'Changed password',
  'account.password_reset': 'Reset password',
  'account.password_set': 'Set password from invite',
  'account.reset_requested': 'Asked for a password reset',
  'account.reset_link_created': 'Made a password link',
  'account.enabled': 'Turned an account on',
  'account.disabled': 'Turned an account off',
  'driver.applied': 'Started an application',
  'driver.invited': 'Invited a driver',
  'driver.account_linked': 'Gave a driver an account',
  'driver.updated': 'Changed details',
  'driver.submitted': 'Sent application for review',
  'driver.licence_checked': 'Checked licence with DVLA',
  'driver.approved': 'Approved the driver',
  'driver.rejected': 'Turned down the application',
  'driver.suspended': 'Suspended the driver',
  'driver.reinstated': 'Reinstated the driver',
  'driver.removed': 'Removed from the roster',
  'driver.on_duty': 'Went on duty',
  'driver.off_duty': 'Went off duty',
  'document.uploaded': 'Uploaded a document',
  'document.deleted': 'Removed a document',
  'document.approved': 'Approved a document',
  'document.rejected': 'Rejected a document',
  'document.viewed': 'Opened a document',
  'job.accepted': 'Took a job',
  'job.en_route': 'Set off to a job',
  'job.on_scene': 'Arrived at a job',
  'job.complete': 'Finished a job',
  'job.cancelled': 'Cancelled a job',
  'job.released': 'Handed a job back',
  'job.deleted': 'Deleted a job',
};

export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

/** The useful part of an audit event's detail, as a line of text. */
export function auditDetail(event: AuditEvent): string {
  const d = event.detail ?? {};
  const parts: string[] = [];
  if (typeof d.docType === 'string') parts.push(DOC_TYPE_BY_KEY[d.docType]?.label ?? d.docType);
  if (typeof d.reason === 'string' && d.reason) parts.push(`“${d.reason}”`);
  if (typeof d.note === 'string' && d.note) parts.push(`“${d.note}”`);
  if (Array.isArray(d.fields) && d.fields.length) parts.push(`Changed ${d.fields.join(', ')}`);
  if (typeof d.checkedOn === 'string') parts.push(`Checked on ${formatDate(d.checkedOn)}`);
  return parts.join(' · ');
}
