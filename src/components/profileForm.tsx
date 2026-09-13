// A driver's details, as forms. The same field lists drive the application
// wizard, the driver's own contact form and the office's edit screens.
/* eslint-disable react-refresh/only-export-components */

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ErrorNotice, Field, inputClass, PrimaryButton } from './console';
import {
  HGV_WEIGHT_KG,
  LICENCE_CATEGORIES,
  MINIMUM_AGE,
  VEHICLE_TYPES,
  type DriverProfile,
  type ProfilePatch,
} from '../driverDocs';

export type FieldKey = keyof ProfilePatch;
export type FormValue = string | boolean | string[];
export type FormValues = Partial<Record<FieldKey, FormValue>>;

export interface FieldDef {
  key: FieldKey;
  label: string;
  kind: 'text' | 'tel' | 'date' | 'number' | 'select' | 'categories' | 'checkbox';
  hint?: ReactNode;
  autoComplete?: string;
  placeholder?: string;
  optional?: boolean;
  options?: { value: string; label: string }[];
  showWhen?: (values: FormValues) => boolean;
  uppercase?: boolean;
}

export const ABOUT_FIELDS: FieldDef[] = [
  {
    key: 'name',
    label: 'Full name',
    kind: 'text',
    autoComplete: 'name',
    hint: 'As it is on your driving licence.',
  },
  {
    key: 'phone',
    label: 'Mobile number',
    kind: 'tel',
    autoComplete: 'tel',
    hint: 'Customers on your jobs will be able to ring you on this.',
  },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    kind: 'date',
    autoComplete: 'bday',
    hint: `You need to be at least ${MINIMUM_AGE}.`,
  },
  { key: 'addressLine1', label: 'Address', kind: 'text', autoComplete: 'address-line1' },
  {
    key: 'addressLine2',
    label: 'Address line 2',
    kind: 'text',
    autoComplete: 'address-line2',
    optional: true,
  },
  { key: 'town', label: 'Town or city', kind: 'text', autoComplete: 'address-level2' },
  {
    key: 'postcode',
    label: 'Postcode',
    kind: 'text',
    autoComplete: 'postal-code',
    uppercase: true,
  },
  {
    key: 'emergencyContactName',
    label: 'Emergency contact',
    kind: 'text',
    hint: 'Someone we can ring if something happens to you on a job.',
  },
  { key: 'emergencyContactPhone', label: "Emergency contact's number", kind: 'tel' },
];

export const LICENCE_FIELDS: FieldDef[] = [
  {
    key: 'licenceNumber',
    label: 'Driving licence number',
    kind: 'text',
    uppercase: true,
    hint: '16 characters, in section 5 of your photocard.',
  },
  {
    key: 'licenceCategories',
    label: 'Categories you can drive',
    kind: 'categories',
    hint: 'On the back of your licence. Over 3.5 tonnes needs C1, over 7.5 tonnes needs C.',
  },
  {
    key: 'licenceExpiry',
    label: 'Licence expiry date',
    kind: 'date',
    hint: 'Section 4b on the front of your photocard.',
  },
  {
    key: 'licencePoints',
    label: 'Penalty points',
    kind: 'number',
    hint: 'Enter 0 if you have none.',
  },
];

export const VEHICLE_FIELDS: FieldDef[] = [
  { key: 'vehicleReg', label: 'Registration', kind: 'text', uppercase: true },
  {
    key: 'vehicleMakeModel',
    label: 'Make and model',
    kind: 'text',
    placeholder: 'e.g. Iveco Daily 72C',
    hint: 'Customers see this so they know which truck to look for.',
  },
  {
    key: 'vehicleType',
    label: 'Type of recovery vehicle',
    kind: 'select',
    options: VEHICLE_TYPES.map((v) => ({ value: v.key, label: v.label })),
  },
  {
    key: 'vehicleGvwKg',
    label: 'Gross vehicle weight (kg)',
    kind: 'number',
    hint: 'The plated weight, on the VIN plate or in section F.1 of the V5C.',
  },
  {
    key: 'operatorLicenceNumber',
    label: "Operator's licence number",
    kind: 'text',
    uppercase: true,
    optional: true,
    showWhen: (values) => Number(values.vehicleGvwKg) > HGV_WEIGHT_KG,
    hint: 'Needed for a vehicle over 3.5 tonnes.',
  },
  {
    key: 'motorwayWork',
    label: 'I want motorway jobs',
    kind: 'checkbox',
    hint: 'You will need a National Highway Sector Scheme 17 (NHSS 17) card.',
  },
];

const CONTACT_KEYS: FieldKey[] = [
  'phone',
  'addressLine1',
  'addressLine2',
  'town',
  'postcode',
  'emergencyContactName',
  'emergencyContactPhone',
];

/** What a driver can still change once their application is in. */
export const CONTACT_FIELDS: FieldDef[] = [
  ...ABOUT_FIELDS.filter((f) => CONTACT_KEYS.includes(f.key)),
  ...VEHICLE_FIELDS.filter((f) => f.key === 'motorwayWork'),
];

export function initialValues(profile: DriverProfile, fields: FieldDef[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const raw = profile[f.key as keyof DriverProfile];
    if (f.kind === 'checkbox') out[f.key] = Boolean(raw);
    else if (f.kind === 'categories') out[f.key] = Array.isArray(raw) ? (raw as string[]) : [];
    else out[f.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return out;
}

export function toPatch(values: FormValues, fields: FieldDef[]): ProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.showWhen && !f.showWhen(values)) continue;
    const value = values[f.key];
    if (f.kind === 'checkbox') {
      patch[f.key] = Boolean(value);
    } else if (f.kind === 'categories') {
      patch[f.key] = Array.isArray(value) ? value : [];
    } else if (f.kind === 'number') {
      const text = String(value ?? '').trim();
      patch[f.key] = text === '' || Number.isNaN(Number(text)) ? null : Number(text);
    } else {
      const text = String(value ?? '').trim();
      patch[f.key] = text === '' ? null : text;
    }
  }
  return patch as ProfilePatch;
}

function isBlank(value: FormValue | undefined): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return false;
  return String(value ?? '').trim() === '';
}

export function ProfileForm({
  fields,
  profile,
  onSave,
  submitLabel,
  requireAll = false,
  footer,
}: {
  fields: FieldDef[];
  profile: DriverProfile;
  onSave: (patch: ProfilePatch) => Promise<unknown>;
  submitLabel: string;
  /** Refuse to save with any required field empty (the application wizard). */
  requireAll?: boolean;
  footer?: ReactNode;
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(profile, fields));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const visible = fields.filter((f) => !f.showWhen || f.showWhen(values));

  const set = (key: FieldKey, value: FormValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (requireAll) {
      const missing = visible
        .filter((f) => !f.optional && f.kind !== 'checkbox' && isBlank(values[f.key]))
        .map((f) => f.label.toLowerCase());
      if (missing.length) {
        setError(new Error(`Fill in ${missing.join(', ')}.`));
        return;
      }
    }
    setBusy(true);
    try {
      await onSave(toPatch(values, fields));
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {visible.map((f) => (
        <FieldInput key={f.key} def={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      <ErrorNotice error={error} />
      {saved && !requireAll && (
        <p className="text-sm font-bold text-[var(--color-success)]" role="status">
          Saved.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {footer}
        <PrimaryButton type="submit" busy={busy}>
          {submitLabel}
        </PrimaryButton>
      </div>
    </form>
  );
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: FormValue | undefined;
  onChange: (value: FormValue) => void;
}) {
  const id = `field-${def.key}`;
  const label = def.optional ? (
    <>
      {def.label}{' '}
      <span className="normal-case tracking-normal font-medium text-neutral-500">(optional)</span>
    </>
  ) : (
    def.label
  );

  if (def.kind === 'checkbox') {
    return (
      <label className="flex items-start gap-3 border-2 border-neutral-800 bg-neutral-950 px-3.5 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-yellow-400 shrink-0"
        />
        <span>
          <span className="font-bold text-sm text-white block">{def.label}</span>
          {def.hint && <span className="text-[12px] text-neutral-500">{def.hint}</span>}
        </span>
      </label>
    );
  }

  if (def.kind === 'categories') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Field label={label} hint={def.hint}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={def.label}>
          {LICENCE_CATEGORIES.map((category) => {
            const on = selected.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((c) => c !== category) : [...selected, category])
                }
                className={`min-w-[3.25rem] px-3 py-2.5 font-display text-base border-2 ${
                  on
                    ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                    : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }

  if (def.kind === 'select') {
    return (
      <Field label={label} htmlFor={id} hint={def.hint}>
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Choose…</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={def.hint}>
      <input
        id={id}
        type={def.kind === 'number' ? 'number' : def.kind}
        inputMode={def.kind === 'number' ? 'numeric' : undefined}
        min={def.kind === 'number' ? 0 : undefined}
        autoComplete={def.autoComplete}
        placeholder={def.placeholder}
        value={String(value ?? '')}
        onChange={(e) => onChange(def.uppercase ? e.target.value.toUpperCase() : e.target.value)}
        className={inputClass}
      />
    </Field>
  );
}
