// A driver's application, from first details to the office's decision.
//
// Five short steps, each saved as it is finished, so a driver can stop at the
// side of the road and carry on tonight. Once sent, the page becomes a status
// page: what is being checked, and anything the office has sent back.

import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check } from '../../icons';
import { useAuth } from '../../auth';
import { PHONE_DISPLAY, PHONE_TEL } from '../../config';
import {
  Banner,
  BlockerList,
  Card,
  Detail,
  ErrorNotice,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { DocumentList } from '../../components/documents';
import {
  ABOUT_FIELDS,
  CONTACT_FIELDS,
  LICENCE_FIELDS,
  ProfileForm,
  VEHICLE_FIELDS,
} from '../../components/profileForm';
import {
  deleteMyDocument,
  fetchMyProfile,
  myDocumentFile,
  saveMyProfile,
  submitMyApplication,
  uploadMyDocument,
} from '../../driver';
import {
  formatDate,
  formatDateTime,
  vehicleTypeLabel,
  type DriverProfile,
  type ProfilePatch,
} from '../../driverDocs';
import { formatReg } from '../../track';
import { useNoIndex } from '../../seo';
import { DriverShell } from './DriverShell';

const STEPS = [
  { key: 'about', label: 'About you' },
  { key: 'licence', label: 'Licence' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'documents', label: 'Documents' },
  { key: 'send', label: 'Send' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

function stepDone(p: DriverProfile, key: StepKey): boolean {
  switch (key) {
    case 'about':
      return Boolean(
        p.phone &&
          p.dateOfBirth &&
          p.addressLine1 &&
          p.town &&
          p.postcode &&
          p.emergencyContactName &&
          p.emergencyContactPhone,
      );
    case 'licence':
      return Boolean(p.licenceNumber && p.licenceCategories.length && p.licenceExpiry);
    case 'vehicle':
      return Boolean(p.vehicleReg && p.vehicleMakeModel && p.vehicleType && p.vehicleGvwKg);
    case 'documents':
      return p.compliance.items
        .filter((i) => i.required)
        .every((i) => i.state !== 'missing' && i.state !== 'rejected');
    case 'send':
      return p.status === 'submitted';
  }
}

const firstOpenStep = (p: DriverProfile): StepKey =>
  STEPS.find((s) => s.key !== 'send' && !stepDone(p, s.key))?.key ?? 'send';

export function DriverApplicationPage() {
  useNoIndex('Your application');
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState<StepKey | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      setProfile(p);
      setError(null);
      setStep((current) => current ?? firstOpenStep(p));
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While the office is deciding, look again now and then so an approval
  // shows up without a refresh.
  const status = profile?.status;
  useEffect(() => {
    if (status !== 'submitted') return;
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [status, load]);

  useEffect(() => {
    if (status === 'active') void refresh();
  }, [status, refresh]);

  if (!profile) {
    return (
      <DriverShell title="Your application">
        {error ? <ErrorNotice error={error} /> : <Loading />}
      </DriverShell>
    );
  }
  if (profile.status === 'active') return <Navigate to="/driver" replace />;

  const save = async (patch: ProfilePatch, next?: StepKey) => {
    const updated = await saveMyProfile(patch);
    setProfile(updated);
    if (next) setStep(next);
  };

  const documents = (
    <DocumentList
      compliance={profile.compliance}
      documents={profile.documents}
      canUpload
      upload={uploadMyDocument}
      fetchFile={myDocumentFile}
      remove={deleteMyDocument}
      onChanged={load}
    />
  );

  if (profile.status === 'suspended') {
    return (
      <DriverShell title="Account suspended">
        <Banner tone="danger" title="You can't take jobs at the moment">
          {profile.reviewNote ?? 'Your account has been suspended.'} Ring the office on{' '}
          <a href={`tel:${PHONE_TEL}`} className="text-yellow-400 underline font-bold">
            {PHONE_DISPLAY}
          </a>{' '}
          to talk it through.
        </Banner>
      </DriverShell>
    );
  }

  if (profile.status === 'submitted') {
    const sentBack = profile.compliance.items.filter((i) => i.state === 'rejected');
    return (
      <DriverShell title="Your application">
        <Banner tone="info" title="We're checking your application">
          Sent {formatDateTime(profile.submittedAt)}. Someone in the office checks every document
          and your licence with DVLA. This page updates when there is news.
        </Banner>
        {sentBack.length > 0 && (
          <Banner tone="warn" title="Something needs replacing">
            <BlockerList
              items={sentBack.map((i) =>
                i.rejectionReason ? `${i.label}: ${i.rejectionReason}` : i.label,
              )}
            />
          </Banner>
        )}
        <Card title="Documents">{documents}</Card>
        <Card title="Contact details">
          <p className="text-sm text-neutral-400 mb-4">
            Your licence and vehicle details are locked while we check them. If they change, ring
            the office on {PHONE_DISPLAY}.
          </p>
          <ProfileForm
            fields={CONTACT_FIELDS}
            profile={profile}
            submitLabel="Save changes"
            onSave={(patch) => save(patch)}
          />
        </Card>
      </DriverShell>
    );
  }

  const current = step ?? firstOpenStep(profile);

  return (
    <DriverShell title="Your application">
      {profile.status === 'rejected' && (
        <Banner tone="warn" title="A few things need changing">
          {profile.reviewNote ?? 'The office has sent your application back.'} Fix them below and
          send it again.
        </Banner>
      )}

      <ol className="grid grid-cols-5 gap-1.5" aria-label="Application steps">
        {STEPS.map((s, i) => {
          const done = stepDone(profile, s.key);
          const active = s.key === current;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(s.key)}
                aria-current={active ? 'step' : undefined}
                className="w-full text-left flex flex-col gap-1.5"
              >
                <span
                  className={`h-1.5 w-full ${
                    active ? 'bg-yellow-400' : done ? 'bg-[var(--color-success)]' : 'bg-neutral-800'
                  }`}
                />
                <span
                  className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider leading-tight flex items-center gap-1 ${
                    active ? 'text-white' : done ? 'text-neutral-300' : 'text-neutral-600'
                  }`}
                >
                  {done && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  <span className="hidden sm:inline">{i + 1}.</span> {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {current === 'about' && (
        <Card title="About you">
          <p className="text-sm text-neutral-400 mb-4">
            Everything saves as you go, so you can stop and come back.
          </p>
          <ProfileForm
            key="about"
            fields={ABOUT_FIELDS}
            profile={profile}
            requireAll
            submitLabel="Save and continue"
            onSave={(patch) => save(patch, 'licence')}
          />
        </Card>
      )}

      {current === 'licence' && (
        <Card title="Your driving licence">
          <p className="text-sm text-neutral-400 mb-4">
            We check every licence with DVLA. When we do, we'll ask you for a check code, which you
            can get at gov.uk/view-driving-licence.
          </p>
          <ProfileForm
            key="licence"
            fields={LICENCE_FIELDS}
            profile={profile}
            requireAll
            submitLabel="Save and continue"
            onSave={(patch) => save(patch, 'vehicle')}
            footer={<SecondaryButton onClick={() => setStep('about')}>Back</SecondaryButton>}
          />
        </Card>
      )}

      {current === 'vehicle' && (
        <Card title="Your recovery vehicle">
          <ProfileForm
            key="vehicle"
            fields={VEHICLE_FIELDS}
            profile={profile}
            requireAll
            submitLabel="Save and continue"
            onSave={(patch) => save(patch, 'documents')}
            footer={<SecondaryButton onClick={() => setStep('licence')}>Back</SecondaryButton>}
          />
        </Card>
      )}

      {current === 'documents' && (
        <Card title="Documents">
          <p className="text-sm text-neutral-400 mb-5">
            Photos from your phone are fine, as long as every word can be read. Anything with a date
            needs the date typed in too.
          </p>
          {documents}
          <div className="flex gap-2 mt-6">
            <SecondaryButton onClick={() => setStep('vehicle')}>Back</SecondaryButton>
            <PrimaryButton onClick={() => setStep('send')}>Continue</PrimaryButton>
          </div>
        </Card>
      )}

      {current === 'send' && (
        <SendStep
          profile={profile}
          onEdit={setStep}
          onSent={(updated) => {
            setProfile(updated);
            void refresh();
          }}
        />
      )}
    </DriverShell>
  );
}

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-bold uppercase tracking-wider text-yellow-400 underline"
    >
      Change
    </button>
  );
}

function SendStep({
  profile,
  onEdit,
  onSent,
}: {
  profile: DriverProfile;
  onEdit: (step: StepKey) => void;
  onSent: (profile: DriverProfile) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blockers = profile.compliance.submitBlockers;
  const required = profile.compliance.items.filter((i) => i.required);
  const uploaded = required.filter((i) => i.state !== 'missing' && i.state !== 'rejected');

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      onSent(await submitMyApplication());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="About you" actions={<EditLink onClick={() => onEdit('about')} />}>
        <dl className="grid sm:grid-cols-2 gap-4">
          <Detail label="Name">{profile.name}</Detail>
          <Detail label="Mobile">{profile.phone}</Detail>
          <Detail label="Date of birth">{formatDate(profile.dateOfBirth)}</Detail>
          <Detail label="Address">
            {[profile.addressLine1, profile.addressLine2, profile.town, profile.postcode]
              .filter(Boolean)
              .join(', ')}
          </Detail>
          <Detail label="Emergency contact">
            {profile.emergencyContactName
              ? `${profile.emergencyContactName}, ${profile.emergencyContactPhone ?? ''}`
              : ''}
          </Detail>
        </dl>
      </Card>
      <Card title="Licence" actions={<EditLink onClick={() => onEdit('licence')} />}>
        <dl className="grid sm:grid-cols-2 gap-4">
          <Detail label="Licence number">{profile.licenceNumber}</Detail>
          <Detail label="Categories">{profile.licenceCategories.join(', ')}</Detail>
          <Detail label="Expires">{formatDate(profile.licenceExpiry)}</Detail>
          <Detail label="Penalty points">{profile.licencePoints ?? ''}</Detail>
        </dl>
      </Card>
      <Card title="Vehicle" actions={<EditLink onClick={() => onEdit('vehicle')} />}>
        <dl className="grid sm:grid-cols-2 gap-4">
          <Detail label="Registration">{profile.vehicleReg ? formatReg(profile.vehicleReg) : ''}</Detail>
          <Detail label="Make and model">{profile.vehicleMakeModel}</Detail>
          <Detail label="Type">{vehicleTypeLabel(profile.vehicleType)}</Detail>
          <Detail label="Gross weight">
            {profile.vehicleGvwKg ? `${profile.vehicleGvwKg.toLocaleString('en-GB')} kg` : ''}
          </Detail>
          <Detail label="Motorway jobs">{profile.motorwayWork ? 'Yes' : 'No'}</Detail>
        </dl>
      </Card>
      <Card title="Documents" actions={<EditLink onClick={() => onEdit('documents')} />}>
        <p className="text-sm text-neutral-300">
          {uploaded.length} of {required.length} required documents uploaded.
        </p>
      </Card>

      {blockers.length > 0 ? (
        <Banner tone="warn" title="Not ready to send yet">
          <BlockerList items={blockers} />
        </Banner>
      ) : (
        <Card title="Send your application">
          <label className="flex items-start gap-3 text-sm text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-yellow-400 shrink-0"
            />
            <span>
              These details are true, and the documents are mine and current. I understand the
              office will check my licence with DVLA.
            </span>
          </label>
          <div className="mt-4 flex flex-col gap-3">
            <ErrorNotice error={error} />
            <div>
              <PrimaryButton onClick={() => void send()} busy={busy} disabled={!confirmed}>
                Send application
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
