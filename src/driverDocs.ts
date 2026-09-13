// The paperwork a recovery driver has to hold, and the shapes the API returns
// about it.
//
// The list itself is read from backend/app/driver_documents.json, the same
// file the server checks against, so the upload screen and the rules can never
// describe two different sets of documents.

import catalogue from '../backend/app/driver_documents.json';
import type { DriverStatus } from './auth';
import type { Driver } from './driver';

export type DocRule = 'always' | 'hgv' | 'motorway' | 'optional';

export interface DocTypeDef {
  key: string;
  label: string;
  group: string;
  hint: string;
  rule: DocRule;
  accept: 'image' | 'image_or_pdf';
  dateKind: 'expiry' | 'issued' | null;
  dateRequired: boolean;
  maxAgeDays: number | null;
  onlyAtApproval: boolean;
  referenceLabel: string | null;
  blocks: 'work' | 'motorway' | null;
}

export const DOC_TYPES = catalogue.documents as unknown as DocTypeDef[];
export const DOC_TYPE_BY_KEY: Record<string, DocTypeDef> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.key, d]),
);
export const DOC_GROUPS: { key: string; label: string }[] = catalogue.groups;
export const VEHICLE_TYPES: { key: string; label: string }[] = catalogue.vehicleTypes;
export const LICENCE_CATEGORIES: string[] = catalogue.licenceCategories;
export const MAX_UPLOAD_BYTES: number = catalogue.maxUploadBytes;
export const MINIMUM_AGE: number = catalogue.minimumAge;
export const HGV_WEIGHT_KG: number = catalogue.hgvWeightKg;

export type DocStateName = 'missing' | 'pending' | 'rejected' | 'approved' | 'expiring' | 'expired';

export interface DocState {
  key: string;
  label: string;
  group: string;
  required: boolean;
  state: DocStateName;
  validUntil: string | null;
  currentDocId: number | null;
  approvedDocId: number | null;
  replacementPending: boolean;
  rejectionReason: string | null;
}

export interface Compliance {
  items: DocState[];
  submitBlockers: string[];
  approvalBlockers: string[];
  workBlockers: string[];
  motorwayBlockers: string[];
  canSubmit: boolean;
  canApprove: boolean;
  canWork: boolean;
  canMotorway: boolean;
}

export interface DocumentInfo {
  id: number;
  docType: string;
  label: string;
  status: 'pending' | 'approved' | 'rejected';
  docDate: string | null;
  validUntil: string | null;
  reference: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  superseded: boolean;
}

export interface DriverProfile {
  id: number;
  userId: number | null;
  email: string | null;
  name: string;
  phone: string | null;
  status: DriverStatus;
  active: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  postcode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  licenceNumber: string | null;
  licenceCategories: string[];
  licenceExpiry: string | null;
  licencePoints: number | null;
  licenceCheckedAt: string | null;
  vehicleReg: string | null;
  vehicleMakeModel: string | null;
  vehicleType: string | null;
  vehicleGvwKg: number | null;
  operatorLicenceNumber: string | null;
  motorwayWork: boolean;
  hasPhoto: boolean;
  live: Driver;
  documents: DocumentInfo[];
  compliance: Compliance;
}

/** The editable part of a profile, as the API accepts it. */
export type ProfilePatch = Partial<
  Pick<
    DriverProfile,
    | 'name'
    | 'phone'
    | 'dateOfBirth'
    | 'addressLine1'
    | 'addressLine2'
    | 'town'
    | 'postcode'
    | 'emergencyContactName'
    | 'emergencyContactPhone'
    | 'licenceNumber'
    | 'licenceCategories'
    | 'licenceExpiry'
    | 'licencePoints'
    | 'vehicleReg'
    | 'vehicleMakeModel'
    | 'vehicleType'
    | 'vehicleGvwKg'
    | 'operatorLicenceNumber'
    | 'motorwayWork'
    | 'licenceCheckedAt'
  >
>;

export const STATE_LABEL: Record<
  DocStateName,
  { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'warn' }
> = {
  missing: { label: 'Not uploaded', tone: 'neutral' },
  pending: { label: 'Being checked', tone: 'info' },
  rejected: { label: 'Needs replacing', tone: 'danger' },
  approved: { label: 'Approved', tone: 'success' },
  expiring: { label: 'Expires soon', tone: 'warn' },
  expired: { label: 'Expired', tone: 'danger' },
};

export const STATUS_LABEL: Record<DriverStatus, string> = {
  draft: 'Application not sent',
  submitted: 'Being reviewed',
  active: 'Approved',
  rejected: 'Needs changes',
  suspended: 'Suspended',
};

export const STATUS_TONE: Record<DriverStatus, 'info' | 'success' | 'neutral' | 'warn' | 'danger'> =
  {
    submitted: 'info',
    active: 'success',
    draft: 'neutral',
    rejected: 'warn',
    suspended: 'danger',
  };

export function dateLabel(def: DocTypeDef): string | null {
  if (def.dateKind === 'expiry') return 'Expiry date';
  if (def.dateKind === 'issued') return 'Date issued';
  return null;
}

export function acceptAttr(def: DocTypeDef): string {
  return def.accept === 'image' ? 'image/*' : 'image/*,application/pdf';
}

export const vehicleTypeLabel = (key: string | null): string =>
  VEHICLE_TYPES.find((v) => v.key === key)?.label ?? key ?? '';

/** "14 Sep 2026" from an ISO date or timestamp. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export const todayIso = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const MAX_IMAGE_EDGE = 2200;
const KEEP_AS_IS_BYTES = 1_500_000;

/**
 * Make a chosen file fit to send. PDFs go as they are. Photos are redrawn at a
 * sensible size: a 12-megapixel phone photo of a V5C is 5 MB and nobody needs
 * more than 2,200 pixels to read it. HEIC from an iPhone is converted where
 * the browser can decode it (Safari can) and explained where it cannot.
 */
export async function prepareUpload(
  file: File,
  def: DocTypeDef,
): Promise<{ blob: Blob; name: string }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (def.accept === 'image') throw new Error('This one needs to be a photo, not a PDF.');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('That PDF is over 8 MB. A photo of the page will do instead.');
    }
    return { blob: file, name: file.name };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? "This photo is in Apple's HEIC format, which this browser can't read. Take a screenshot of it and upload that, or set Settings, Camera, Formats to Most Compatible."
        : 'That file could not be read. Upload a photo (JPEG or PNG) or a PDF.',
    );
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const alreadyFine =
    scale === 1 && file.size <= KEEP_AS_IS_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type);
  if (alreadyFine) {
    bitmap.close();
    return { blob: file, name: file.name };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('That photo could not be prepared. Try another.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('That photo could not be prepared. Try another.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('That photo is too large even after shrinking.');
  return { blob, name: `${file.name.replace(/\.[^.]+$/, '') || def.key}.jpg` };
}
