import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  absoluteLink,
  inviteDriver,
  listDriverSummaries,
  type DriverSummary,
  type Invite,
} from '../../adminApi';
import {
  Card,
  Chip,
  ErrorNotice,
  Field,
  inputClass,
  LinkBox,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { STATUS_LABEL, STATUS_TONE, formatDateTime, vehicleTypeLabel } from '../../driverDocs';
import { formatReg } from '../../track';

const FILTERS = [
  { key: 'submitted', label: 'To review' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Applying' },
  { key: 'rejected', label: 'Turned down' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'all', label: 'All' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export function AdminDrivers() {
  const [rows, setRows] = useState<DriverSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<FilterKey>('submitted');
  const [inviting, setInviting] = useState(false);
  const chosenFilter = useRef(false);

  const load = useCallback(async () => {
    try {
      const all = await listDriverSummaries();
      setRows(all);
      setError(null);
      // Open on the review queue, unless it is empty.
      if (!chosenFilter.current) {
        chosenFilter.current = true;
        if (!all.some((r) => r.status === 'submitted')) setFilter('active');
      }
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = (key: FilterKey) =>
    rows ? (key === 'all' ? rows.length : rows.filter((r) => r.status === key).length) : 0;
  const visible = rows ? (filter === 'all' ? rows : rows.filter((r) => r.status === filter)) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-white uppercase tracking-tight">Drivers</h1>
        <SecondaryButton onClick={() => setInviting((v) => !v)}>
          {inviting ? 'Close' : 'Invite a driver'}
        </SecondaryButton>
      </div>

      {inviting && <InviteDriver onInvited={load} />}

      <nav className="flex gap-1 overflow-x-auto" aria-label="Filter drivers">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              chosenFilter.current = true;
              setFilter(f.key);
            }}
            aria-pressed={filter === f.key}
            className={`shrink-0 px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border-2 ${
              filter === f.key
                ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-60">{count(f.key)}</span>
          </button>
        ))}
      </nav>

      <ErrorNotice error={error} />

      {rows === null ? (
        !error && <Loading />
      ) : visible.length === 0 ? (
        <p className="text-neutral-500 text-sm border-2 border-neutral-900 px-4 py-10 text-center">
          {filter === 'submitted' ? 'No applications waiting.' : 'Nobody here.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((r) => (
            <li key={r.id}>
              <Link
                to={`/admin/drivers/${r.id}`}
                className="block border-2 border-neutral-800 bg-neutral-900 hover:border-yellow-400 p-4 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-white">{r.name}</div>
                    <div className="text-[12px] text-neutral-500 truncate">
                      {r.email ?? 'No sign-in yet'}
                      {r.phone ? ` · ${r.phone}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
                    {r.status === 'active' &&
                      (r.canWork ? (
                        <Chip tone="success">Can work</Chip>
                      ) : (
                        <Chip tone="danger">Can't work</Chip>
                      ))}
                    {r.available && <Chip tone="warn">On duty</Chip>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-neutral-400">
                  {r.vehicleReg && (
                    <span>
                      {formatReg(r.vehicleReg)}
                      {r.vehicleType ? ` · ${vehicleTypeLabel(r.vehicleType)}` : ''}
                      {r.vehicleGvwKg ? ` · ${r.vehicleGvwKg.toLocaleString('en-GB')} kg` : ''}
                    </span>
                  )}
                  {r.pendingDocs > 0 && (
                    <span className="text-[var(--color-navy-300)] font-bold">
                      {r.pendingDocs} to check
                    </span>
                  )}
                  {r.missingDocs > 0 && <span>{r.missingDocs} missing</span>}
                  {r.expiringDocs > 0 && (
                    <span className="text-yellow-400 font-bold">{r.expiringDocs} expiring</span>
                  )}
                  {r.expiredDocs > 0 && (
                    <span className="text-[var(--color-danger-soft)] font-bold">
                      {r.expiredDocs} expired
                    </span>
                  )}
                  {r.status === 'submitted' && r.submittedAt && (
                    <span>Sent {formatDateTime(r.submittedAt)}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteDriver({ onInvited }: { onInvited: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invite, setInvite] = useState<{ invite: Invite; name: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await inviteDriver({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      setInvite({ invite: created, name: name.trim() });
      setName('');
      setEmail('');
      setPhone('');
      await onInvited();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Invite a driver">
      <p className="text-sm text-neutral-400 mb-4">
        For someone you already know. They get a link to set a password, then fill in their
        application and documents like anyone else.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-end" noValidate>
        <Field label="Name" htmlFor="inv-name">
          <input
            id="inv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="inv-email">
          <input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Mobile (optional)" htmlFor="inv-phone">
          <input
            id="inv-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-3 flex flex-col gap-3">
          <ErrorNotice error={error} />
          <div>
            <PrimaryButton type="submit" busy={busy} disabled={!name.trim() || !email.trim()}>
              Create invite
            </PrimaryButton>
          </div>
        </div>
      </form>
      {invite && (
        <div className="mt-4">
          <LinkBox
            url={absoluteLink(invite.invite.setupPath)}
            note={`Send this to ${invite.name}. It works once, until ${formatDateTime(invite.invite.expiresAt)}.`}
          />
        </div>
      )}
    </Card>
  );
}
