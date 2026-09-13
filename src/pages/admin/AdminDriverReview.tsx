// One driver, everything the office needs to decide about them: each document
// with a viewer and approve or send back, the DVLA check, the decision itself,
// their sign-in, and the history of who did what.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  absoluteLink,
  actionLabel,
  auditDetail,
  createResetLink,
  decideDriver,
  documentFile,
  fetchDriverDetail,
  linkDriverAccount,
  removeDriver,
  reviewDocument,
  submitForDriver,
  updateDriverProfile,
  uploadForDriver,
  type AdminDriverDetail,
  type AuditEvent,
  type Invite,
} from '../../adminApi';
import {
  Banner,
  BlockerList,
  Card,
  Chip,
  DangerButton,
  Detail,
  ErrorNotice,
  Field,
  inputClass,
  LinkBox,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { DocumentList, FileViewer } from '../../components/documents';
import {
  ABOUT_FIELDS,
  LICENCE_FIELDS,
  ProfileForm,
  VEHICLE_FIELDS,
  type FieldDef,
} from '../../components/profileForm';
import {
  STATUS_LABEL,
  STATUS_TONE,
  dateLabel,
  daysUntil,
  formatDate,
  formatDateTime,
  todayIso,
  vehicleTypeLabel,
  type DocTypeDef,
  type DocumentInfo,
  type DriverProfile,
} from '../../driverDocs';
import { formatReg } from '../../track';

function age(isoDate: string): number {
  const born = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  if (
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
  ) {
    years -= 1;
  }
  return years;
}

export function AdminDriverReview() {
  const params = useParams();
  const driverId = Number(params.id);
  const [detail, setDetail] = useState<AdminDriverDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await fetchDriverDetail(driverId));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <Link
      to="/admin/drivers"
      className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white self-start"
    >
      ← All drivers
    </Link>
  );

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {error ? <ErrorNotice error={error} /> : <Loading />}
      </div>
    );
  }

  const p = detail.profile;
  const earlier = detail.history.filter((d) => d.superseded);
  const address = [p.addressLine1, p.addressLine2, p.town, p.postcode].filter(Boolean).join(', ');

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl uppercase tracking-tight text-white leading-none">
            {p.name}
          </h1>
          <p className="text-sm text-neutral-400 mt-1.5 break-words">
            {p.email ?? 'No sign-in yet'}
            {p.phone ? ` · ${p.phone}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Chip>
          {p.live.available && <Chip tone="warn">On duty</Chip>}
          {!p.active && <Chip tone="danger">Removed</Chip>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0 order-2 lg:order-1">
          <Card title="Documents">
            <DocumentList
              compliance={p.compliance}
              documents={p.documents}
              canUpload={p.active}
              upload={(docType, blob, meta, onProgress) =>
                uploadForDriver(p.id, docType, blob, meta, onProgress)
              }
              fetchFile={documentFile}
              onChanged={load}
              showHints={false}
              reviewActions={(doc, def) => (
                <ReviewActions
                  key={`${doc.id}-${doc.status}`}
                  doc={doc}
                  def={def}
                  onReviewed={setDetail}
                />
              )}
            />
          </Card>

          <DetailsCard title="About" fields={ABOUT_FIELDS} profile={p} onSaved={setDetail}>
            <dl className="grid sm:grid-cols-2 gap-4">
              <Detail label="Date of birth">
                {p.dateOfBirth ? `${formatDate(p.dateOfBirth)} (age ${age(p.dateOfBirth)})` : ''}
              </Detail>
              <Detail label="Address">{address}</Detail>
              <Detail label="Emergency contact">
                {p.emergencyContactName
                  ? `${p.emergencyContactName}, ${p.emergencyContactPhone ?? ''}`
                  : ''}
              </Detail>
              <Detail label="Sent for review">{formatDateTime(p.submittedAt)}</Detail>
            </dl>
          </DetailsCard>

          <DetailsCard title="Vehicle" fields={VEHICLE_FIELDS} profile={p} onSaved={setDetail}>
            <dl className="grid sm:grid-cols-2 gap-4">
              <Detail label="Registration">{p.vehicleReg ? formatReg(p.vehicleReg) : ''}</Detail>
              <Detail label="Make and model">{p.vehicleMakeModel}</Detail>
              <Detail label="Type">{vehicleTypeLabel(p.vehicleType)}</Detail>
              <Detail label="Gross weight">
                {p.vehicleGvwKg ? `${p.vehicleGvwKg.toLocaleString('en-GB')} kg` : ''}
              </Detail>
              <Detail label="Operator's licence">{p.operatorLicenceNumber}</Detail>
              <Detail label="Motorway jobs">{p.motorwayWork ? 'Yes' : 'No'}</Detail>
            </dl>
          </DetailsCard>

          {earlier.length > 0 && <EarlierCopies docs={earlier} />}
          <Activity events={detail.audit} />
        </div>

        <aside className="flex flex-col gap-5 order-1 lg:order-2">
          <DecisionPanel detail={detail} onChange={setDetail} />
          <LicenceCheck profile={p} onChange={setDetail} />
          <AccountBox profile={p} reload={load} />
        </aside>
      </div>
    </div>
  );
}

function DetailsCard({
  title,
  fields,
  profile,
  onSaved,
  children,
}: {
  title: string;
  fields: FieldDef[];
  profile: DriverProfile;
  onSaved: (detail: AdminDriverDetail) => void;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card
      title={title}
      actions={
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-xs font-bold uppercase tracking-wider text-yellow-400 underline"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      }
    >
      {editing ? (
        <ProfileForm
          fields={fields}
          profile={profile}
          submitLabel="Save"
          onSave={async (patch) => {
            onSaved(await updateDriverProfile(profile.id, patch));
            setEditing(false);
          }}
        />
      ) : (
        children
      )}
    </Card>
  );
}

function DecisionPanel({
  detail,
  onChange,
}: {
  detail: AdminDriverDetail;
  onChange: (detail: AdminDriverDetail) => void;
}) {
  const p = detail.profile;
  const c = p.compliance;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const act = async (key: string, action: () => Promise<AdminDriverDetail>) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await action());
      setNote('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const noteField = (label: string) => (
    <Field label={label} htmlFor="decision-note">
      <textarea
        id="decision-note"
        rows={3}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={inputClass}
      />
    </Field>
  );

  let body: ReactNode = null;
  if (!p.active) {
    body = <p className="text-sm text-neutral-400">This driver has been removed from the roster.</p>;
  } else if (p.status === 'submitted') {
    body = (
      <>
        {c.canApprove ? (
          <Banner tone="success" title="Ready to approve">
            Every document is checked and in date, and the licence has been checked with DVLA.
          </Banner>
        ) : (
          <Banner tone="warn" title="Not ready to approve">
            <BlockerList items={c.approvalBlockers} />
          </Banner>
        )}
        {noteField('Note to the driver (needed to turn down)')}
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!c.canApprove}
            busy={busy === 'approve'}
            onClick={() => void act('approve', () => decideDriver(p.id, 'approve', note))}
          >
            Approve driver
          </PrimaryButton>
          <DangerButton
            busy={busy === 'reject'}
            onClick={() => void act('reject', () => decideDriver(p.id, 'reject', note))}
          >
            Turn down
          </DangerButton>
        </div>
      </>
    );
  } else if (p.status === 'draft' || p.status === 'rejected') {
    body = (
      <>
        {p.status === 'rejected' && p.reviewNote && (
          <Banner tone="warn" title="Sent back">
            {p.reviewNote}
          </Banner>
        )}
        <p className="text-sm text-neutral-400">
          {p.status === 'draft'
            ? "The driver hasn't sent their application yet."
            : 'Waiting for the driver to fix things and send it again.'}
        </p>
        {c.submitBlockers.length > 0 ? (
          <Banner tone="neutral" title="Still missing">
            <BlockerList items={c.submitBlockers} />
          </Banner>
        ) : (
          <SecondaryButton
            busy={busy === 'submit'}
            onClick={() => void act('submit', () => submitForDriver(p.id))}
          >
            Send for review on their behalf
          </SecondaryButton>
        )}
      </>
    );
  } else if (p.status === 'active') {
    body = (
      <>
        {c.canWork ? (
          <Banner tone="success" title="Can take jobs">
            {p.motorwayWork && !c.canMotorway
              ? 'Not motorway jobs yet: the NHSS 17 card is not approved and in date.'
              : undefined}
          </Banner>
        ) : (
          <Banner tone="danger" title="Can't take jobs right now">
            <BlockerList items={c.workBlockers} />
          </Banner>
        )}
        {noteField('Reason for suspending')}
        <div>
          <DangerButton
            busy={busy === 'suspend'}
            onClick={() => void act('suspend', () => decideDriver(p.id, 'suspend', note))}
          >
            Suspend
          </DangerButton>
        </div>
      </>
    );
  } else if (p.status === 'suspended') {
    body = (
      <>
        <Banner tone="danger" title="Suspended">
          {p.reviewNote}
        </Banner>
        <div>
          <PrimaryButton
            busy={busy === 'reinstate'}
            onClick={() => void act('reinstate', () => decideDriver(p.id, 'reinstate'))}
          >
            Reinstate
          </PrimaryButton>
        </div>
      </>
    );
  }

  return (
    <Card title="Decision">
      <div className="flex flex-col gap-3">
        {body}
        <ErrorNotice error={error} />
        {p.reviewedAt && (
          <p className="text-[12px] text-neutral-500">
            Last decision {formatDateTime(p.reviewedAt)}
            {p.reviewedBy ? ` by ${p.reviewedBy}` : ''}.
          </p>
        )}
      </div>
    </Card>
  );
}

function LicenceCheck({
  profile,
  onChange,
}: {
  profile: DriverProfile;
  onChange: (detail: AdminDriverDetail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const since = profile.licenceCheckedAt ? -(daysUntil(profile.licenceCheckedAt) ?? 0) : null;
  const stale = since === null || since > 30;

  const record = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await updateDriverProfile(profile.id, { licenceCheckedAt: todayIso() }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Licence and DVLA check"
      actions={
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-xs font-bold uppercase tracking-wider text-yellow-400 underline"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      }
    >
      {editing ? (
        <ProfileForm
          fields={LICENCE_FIELDS}
          profile={profile}
          submitLabel="Save"
          onSave={async (patch) => {
            onChange(await updateDriverProfile(profile.id, patch));
            setEditing(false);
          }}
        />
      ) : (
        <dl className="grid grid-cols-2 gap-4">
          <Detail label="Licence number">{profile.licenceNumber}</Detail>
          <Detail label="Categories">{profile.licenceCategories.join(', ')}</Detail>
          <Detail label="Expires">{formatDate(profile.licenceExpiry)}</Detail>
          <Detail label="Penalty points">{profile.licencePoints ?? ''}</Detail>
        </dl>
      )}
      <div className="mt-4 border-t-2 border-neutral-800 pt-4 flex flex-col gap-3">
        {profile.licenceCheckedAt ? (
          <p
            className={`text-sm font-bold ${stale ? 'text-yellow-400' : 'text-[var(--color-success)]'}`}
          >
            Checked {formatDate(profile.licenceCheckedAt)}
            {since !== null ? ` (${since === 0 ? 'today' : `${since} day${since === 1 ? '' : 's'} ago`})` : ''}
            {stale ? '. Check again before approving.' : ''}
          </p>
        ) : (
          <p className="text-sm font-bold text-yellow-400">Not checked with DVLA yet.</p>
        )}
        <ol className="list-decimal list-outside pl-5 text-[13px] text-neutral-400 flex flex-col gap-1.5">
          <li>
            Ask the driver for a check code. They get one at{' '}
            <a
              href="https://www.gov.uk/view-driving-licence"
              target="_blank"
              rel="noreferrer"
              className="text-yellow-400 underline"
            >
              gov.uk/view-driving-licence
            </a>
            .
          </li>
          <li>
            Enter it with the last 8 characters of their licence number
            {profile.licenceNumber ? ` (${profile.licenceNumber.slice(-8)})` : ''} at{' '}
            <a
              href="https://www.gov.uk/check-driving-information"
              target="_blank"
              rel="noreferrer"
              className="text-yellow-400 underline"
            >
              gov.uk/check-driving-information
            </a>
            .
          </li>
          <li>Check the categories, expiry and any endorsements match, then record it here.</li>
        </ol>
        <ErrorNotice error={error} />
        <div>
          <PrimaryButton onClick={() => void record()} busy={busy}>
            I've checked it today
          </PrimaryButton>
        </div>
      </div>
    </Card>
  );
}

function AccountBox({ profile, reload }: { profile: DriverProfile; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const userId = profile.userId;

  return (
    <Card title="Sign-in">
      {userId ? (
        <p className="text-sm text-neutral-300 break-words">
          Signs in as <strong className="text-white">{profile.email}</strong>.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-400 mb-3">
            This driver has no sign-in yet. Create one and send them the link.
          </p>
          <Field label="Their email" htmlFor="account-email">
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
        </>
      )}

      {invite && (
        <div className="mt-3">
          <LinkBox
            url={absoluteLink(invite.setupPath)}
            note={`Works once, until ${formatDateTime(invite.expiresAt)}.`}
          />
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3">
        <ErrorNotice error={error} />
        <div className="flex flex-wrap gap-2">
          {userId ? (
            <SecondaryButton
              busy={busy}
              onClick={() => void run(async () => setInvite(await createResetLink(userId)))}
            >
              Make a password link
            </SecondaryButton>
          ) : (
            <PrimaryButton
              busy={busy}
              disabled={!email.trim()}
              onClick={() =>
                void run(async () => {
                  setInvite(await linkDriverAccount(profile.id, email.trim()));
                  await reload();
                })
              }
            >
              Create sign-in
            </PrimaryButton>
          )}
        </div>
      </div>

      {profile.active && (
        <div className="mt-4 pt-4 border-t-2 border-neutral-800">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-300">
                Take {profile.name} off the roster for good?
              </span>
              <DangerButton
                busy={busy}
                onClick={() =>
                  void run(async () => {
                    await removeDriver(profile.id);
                    navigate('/admin/drivers');
                  })
                }
              >
                Remove
              </DangerButton>
              <SecondaryButton onClick={() => setConfirmRemove(false)}>Keep</SecondaryButton>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-[var(--color-danger-soft)]"
            >
              Remove from roster
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function ReviewActions({
  doc,
  def,
  onReviewed,
}: {
  doc: DocumentInfo;
  def: DocTypeDef;
  onReviewed: (detail: AdminDriverDetail) => void;
}) {
  const [open, setOpen] = useState(doc.status === 'pending');
  const [docDate, setDocDate] = useState(doc.docDate ?? '');
  const [reference, setReference] = useState(doc.reference ?? '');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (doc.superseded) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white underline"
      >
        Change decision
      </button>
    );
  }

  const dl = dateLabel(def);

  const send = async (decision: 'approve' | 'reject') => {
    setError(null);
    if (decision === 'reject' && !reason.trim()) {
      setError(new Error('Say what is wrong, so the driver can fix it.'));
      return;
    }
    setBusy(true);
    try {
      onReviewed(
        await reviewDocument(doc.id, {
          decision,
          reason: decision === 'reject' ? reason.trim() : undefined,
          ...(def.dateKind ? { docDate: docDate || null } : {}),
          reference: reference.trim() || null,
        }),
      );
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-neutral-700 bg-neutral-950 p-3 flex flex-col gap-3">
      <p className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
        Check this document
      </p>
      {dl && (
        <Field label={`${dl}, as printed on it`} htmlFor={`review-date-${doc.id}`}>
          <input
            id={`review-date-${doc.id}`}
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {def.referenceLabel && (
        <Field label={def.referenceLabel} htmlFor={`review-ref-${doc.id}`}>
          <input
            id={`review-ref-${doc.id}`}
            value={reference}
            maxLength={60}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {rejecting && (
        <Field label="What's wrong with it" htmlFor={`review-reason-${doc.id}`}>
          <textarea
            id={`review-reason-${doc.id}`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="e.g. The expiry date is cut off. Please take the photo again."
          />
        </Field>
      )}
      <ErrorNotice error={error} />
      <div className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <DangerButton busy={busy} onClick={() => void send('reject')}>
              Send back to driver
            </DangerButton>
            <SecondaryButton onClick={() => setRejecting(false)}>Cancel</SecondaryButton>
          </>
        ) : (
          <>
            <PrimaryButton busy={busy} onClick={() => void send('approve')}>
              Approve
            </PrimaryButton>
            <SecondaryButton onClick={() => setRejecting(true)}>Send back</SecondaryButton>
            {doc.status !== 'pending' && (
              <SecondaryButton onClick={() => setOpen(false)}>Close</SecondaryButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EarlierCopies({ docs }: { docs: DocumentInfo[] }) {
  const [viewing, setViewing] = useState<DocumentInfo | null>(null);
  return (
    <Card title="Earlier copies">
      <ul className="flex flex-col divide-y divide-neutral-800">
        {docs.map((d) => (
          <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white">{d.label}</div>
              <div className="text-[12px] text-neutral-500 truncate">
                {d.fileName} · uploaded {formatDate(d.uploadedAt)}
                {d.status === 'rejected' ? ' · sent back' : d.status === 'approved' ? ' · was approved' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewing(d)}
              className="text-xs font-bold uppercase tracking-wider text-yellow-400 underline shrink-0"
            >
              View
            </button>
          </li>
        ))}
      </ul>
      {viewing && (
        <FileViewer doc={viewing} fetchFile={documentFile} onClose={() => setViewing(null)} />
      )}
    </Card>
  );
}

function Activity({ events }: { events: AuditEvent[] }) {
  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e) => {
            const extra = auditDetail(e);
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="text-[12px] text-neutral-500 tabular-nums shrink-0 w-28">
                  {formatDateTime(e.createdAt)}
                </span>
                <span className="min-w-0">
                  <span className="text-white">{actionLabel(e.action)}</span>
                  <span className="text-neutral-500"> · {e.actorLabel}</span>
                  {extra && (
                    <span className="block text-[12px] text-neutral-400 break-words">{extra}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
