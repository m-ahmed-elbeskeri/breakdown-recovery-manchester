import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../apiClient';
import { Banner, ErrorNotice, Field, inputClass, PrimaryButton } from '../../components/console';
import { useNoIndex } from '../../seo';
import { AuthShell } from './AuthLayout';

export function ForgotPasswordPage() {
  useNoIndex('Forgotten password');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError(new Error('Enter the email you sign in with.'));
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/auth/password-reset/request', {
        method: 'POST',
        json: { email: email.trim(), origin: window.location.origin },
      });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Forgotten password"
      intro="We'll email you a link to choose a new one."
      footer={
        <Link to="/login" className="text-yellow-400 underline font-bold">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Banner tone="success" title="Check your email">
          If there is an account for {email.trim()}, a link is on its way. It works once and
          expires in an hour. Nothing arrived? Ask the office to send you a link instead.
        </Banner>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <ErrorNotice error={error} />
          <PrimaryButton type="submit" busy={busy} className="w-full py-3.5">
            Send me a link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
