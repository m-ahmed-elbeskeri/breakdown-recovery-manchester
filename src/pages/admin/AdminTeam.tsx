// The office's own accounts. Every admin signs in as themselves, so the audit
// log says who did what, and someone who leaves can be turned off without
// changing anybody else's password.

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  absoluteLink,
  createAdmin,
  createResetLink,
  listAdmins,
  setUserActive,
  type Invite,
} from '../../adminApi';
import { useAuth, type User } from '../../auth';
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
import { formatDateTime } from '../../driverDocs';

export function AdminTeam() {
  const { user: me } = useAuth();
  const [admins, setAdmins] = useState<User[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setAdmins(await listAdmins());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl text-white uppercase tracking-tight">Team</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Everyone who can use this admin. Each person has their own sign-in.
        </p>
      </div>
      <ErrorNotice error={error} />
      {admins === null ? (
        !error && <Loading />
      ) : (
        <ul className="flex flex-col gap-2">
          {admins.map((a) => (
            <AdminRow key={a.id} admin={a} isMe={a.id === me?.id} onChanged={load} />
          ))}
        </ul>
      )}
      <InviteAdmin onInvited={load} />
    </div>
  );
}

function AdminRow({
  admin,
  isMe,
  onChanged,
}: {
  admin: User;
  isMe: boolean;
  onChanged: () => Promise<void>;
}) {
  const [link, setLink] = useState<Invite | null>(null);
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

  return (
    <li className="border-2 border-neutral-800 bg-neutral-900 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-white">
            {admin.name}
            {isMe && <span className="text-neutral-500 font-medium"> (you)</span>}
          </div>
          <div className="text-[12px] text-neutral-500 break-words">
            {admin.email}
            {admin.lastLoginAt
              ? ` · last signed in ${formatDateTime(admin.lastLoginAt)}`
              : admin.hasPassword
                ? ''
                : ' · has not set a password yet'}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {admin.isActive ? <Chip tone="success">Active</Chip> : <Chip tone="danger">Off</Chip>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {admin.isActive && (
          <SecondaryButton
            busy={busy}
            onClick={() => void run(async () => setLink(await createResetLink(admin.id)))}
          >
            {admin.hasPassword ? 'Make a password link' : 'Make a new invite link'}
          </SecondaryButton>
        )}
        {!isMe && (
          <SecondaryButton
            busy={busy}
            onClick={() =>
              void run(async () => {
                await setUserActive(admin.id, !admin.isActive);
                setLink(null);
                await onChanged();
              })
            }
          >
            {admin.isActive ? 'Turn off' : 'Turn back on'}
          </SecondaryButton>
        )}
      </div>
      <ErrorNotice error={error} />
      {link && (
        <LinkBox
          url={absoluteLink(link.setupPath)}
          note={`Send this to ${admin.name}. It works once, until ${formatDateTime(link.expiresAt)}.`}
        />
      )}
    </li>
  );
}

function InviteAdmin({ onInvited }: { onInvited: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invite, setInvite] = useState<{ invite: Invite; name: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await createAdmin({ name: name.trim(), email: email.trim() });
      setInvite({ invite: created, name: name.trim() });
      setName('');
      setEmail('');
      await onInvited();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add someone to the office">
      <p className="text-sm text-neutral-400 mb-4">
        They can see every booking, driver and document, and approve drivers. Only add people who
        need that.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 items-end" noValidate>
        <Field label="Name" htmlFor="admin-name">
          <input
            id="admin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="admin-email">
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2 flex flex-col gap-3">
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
