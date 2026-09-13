// First run: no admin account exists yet. The operator key from the server's
// settings proves this is the business setting itself up, once. After that,
// the key signs nobody in.

import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../apiClient';
import { useAuth, type Session } from '../../auth';
import {
  ErrorNotice,
  Field,
  inputClass,
  PasswordInput,
  PrimaryButton,
} from '../../components/console';
import { useNoIndex } from '../../seo';
import { AuthShell } from '../account/AuthLayout';

export function AdminSetup({ onDone }: { onDone: () => void }) {
  useNoIndex('Set up the office');
  const { adopt } = useAuth();
  const [operatorKey, setOperatorKey] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(new Error("The two passwords don't match."));
      return;
    }
    setBusy(true);
    try {
      const session = await apiFetch<Session>('/api/auth/setup', {
        method: 'POST',
        json: { operatorKey, name: name.trim(), email: email.trim(), password },
      });
      adopt(session);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Set up the office"
      intro="There is no admin account yet. Create the first one. You'll need the operator key (ADMIN_API_KEY) from the server's settings. It is only used for this; afterwards everyone signs in with their own email and password."
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Operator key" htmlFor="key">
          <PasswordInput
            id="key"
            value={operatorKey}
            onChange={setOperatorKey}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Your name" htmlFor="name">
          <input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Your email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Choose a password" htmlFor="password" hint="At least 10 characters.">
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
          Create admin account
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
