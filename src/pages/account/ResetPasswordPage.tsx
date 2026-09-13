// Setting a password from a one-time link: a reset, or an invite to a new
// account. Either way the person is signed in straight after.

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../apiClient';
import { homeFor, useAuth, type Session } from '../../auth';
import {
  Banner,
  ErrorNotice,
  Field,
  Loading,
  PasswordInput,
  PrimaryButton,
} from '../../components/console';
import { useNoIndex } from '../../seo';
import { AuthShell } from './AuthLayout';

interface TokenCheck {
  valid: boolean;
  purpose: 'reset' | 'invite' | null;
  name: string | null;
  email: string | null;
}

export function ResetPasswordPage() {
  useNoIndex('Set your password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const [check, setCheck] = useState<TokenCheck | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) {
      setCheck({ valid: false, purpose: null, name: null, email: null });
      return;
    }
    apiFetch<TokenCheck>(`/api/auth/password-reset/check?token=${encodeURIComponent(token)}`)
      .then(setCheck)
      .catch(() => setCheck({ valid: false, purpose: null, name: null, email: null }));
  }, [token]);

  const invite = check?.purpose === 'invite' || params.get('invite') === '1';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(new Error('Use at least 10 characters.'));
      return;
    }
    if (password !== confirm) {
      setError(new Error("The two passwords don't match."));
      return;
    }
    setBusy(true);
    try {
      const session = await apiFetch<Session>('/api/auth/password-reset/confirm', {
        method: 'POST',
        json: { token, password },
      });
      navigate(homeFor(adopt(session)), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={invite ? 'Set your password' : 'Choose a new password'}
      intro={
        check?.valid && check.name
          ? `For ${check.name} (${check.email}).`
          : 'Pick something you will remember. A short phrase works well.'
      }
      footer={
        <Link to="/login" className="text-yellow-400 underline font-bold">
          Back to sign in
        </Link>
      }
    >
      {check === null ? (
        <Loading label="Checking your link…" />
      ) : !check.valid ? (
        <Banner
          tone="danger"
          title="This link has expired"
          actions={
            <PrimaryButton to="/forgot-password">Get a new link</PrimaryButton>
          }
        >
          Links work once and expire after a while. Ask for a new one, or ask the office to send
          you one.
        </Banner>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="New password" htmlFor="password" hint="At least 10 characters.">
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Type it again" htmlFor="confirm">
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
          </Field>
          <ErrorNotice error={error} />
          <PrimaryButton type="submit" busy={busy} className="w-full py-3.5">
            {invite ? 'Set password and continue' : 'Save and sign in'}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
