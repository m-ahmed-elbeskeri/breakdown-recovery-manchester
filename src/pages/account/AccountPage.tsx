import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../apiClient';
import { useAuth } from '../../auth';
import {
  Banner,
  Card,
  Detail,
  ErrorNotice,
  Field,
  PasswordInput,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { formatDateTime } from '../../driverDocs';
import { useNoIndex } from '../../seo';
import { DriverShell } from '../driver/DriverShell';

/** Your own account: who you are signed in as, your password, signing out. */
export function AccountPanel() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!user) return null;

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError(new Error("The two new passwords don't match."));
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/auth/password', {
        method: 'POST',
        json: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const leave = async (everywhere: boolean) => {
    await signOut(everywhere);
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Your account">
        <dl className="grid sm:grid-cols-2 gap-4">
          <Detail label="Name">{user.name}</Detail>
          <Detail label="Email">{user.email}</Detail>
          <Detail label="Account">{user.role === 'admin' ? 'Office admin' : 'Driver'}</Detail>
          <Detail label="Last signed in">{formatDateTime(user.lastLoginAt)}</Detail>
        </dl>
      </Card>

      <Card title="Change password">
        <form onSubmit={change} className="flex flex-col gap-4 max-w-md" noValidate>
          <Field label="Current password" htmlFor="current">
            <PasswordInput
              id="current"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" htmlFor="new" hint="At least 10 characters.">
            <PasswordInput id="new" value={next} onChange={setNext} autoComplete="new-password" />
          </Field>
          <Field label="Type the new one again" htmlFor="confirm">
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
          </Field>
          <ErrorNotice error={error} />
          {done && (
            <Banner tone="success" title="Password changed">
              Any other phone or computer signed in as you has been signed out.
            </Banner>
          )}
          <div>
            <PrimaryButton type="submit" busy={busy}>
              Change password
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <Card title="Sign out">
        <p className="text-sm text-neutral-400 mb-3">
          Lost a phone, or signed in somewhere you shouldn't have? Sign out everywhere and every
          device will need your password again.
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => void leave(false)}>Sign out</SecondaryButton>
          <SecondaryButton onClick={() => void leave(true)}>Sign out everywhere</SecondaryButton>
        </div>
      </Card>
    </div>
  );
}

export function DriverAccountPage() {
  useNoIndex('Account');
  return (
    <DriverShell title="Account">
      <AccountPanel />
    </DriverShell>
  );
}
