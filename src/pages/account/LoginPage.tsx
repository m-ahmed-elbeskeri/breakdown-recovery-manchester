import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { homeFor, useAuth, type User } from '../../auth';
import {
  ErrorNotice,
  Field,
  inputClass,
  PasswordInput,
  PrimaryButton,
} from '../../components/console';
import { useNoIndex } from '../../seo';
import { AuthShell } from './AuthLayout';

/** Where to go after signing in: back where they were, if it is theirs to see. */
function destination(user: User, next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return homeFor(user);
  if (next.startsWith('/admin')) return user.role === 'admin' ? next : homeFor(user);
  if (next.startsWith('/driver/')) return user.role === 'driver' ? next : homeFor(user);
  if (next === '/driver') return homeFor(user);
  return homeFor(user);
}

export function LoginPage() {
  useNoIndex('Sign in');
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (user) return <Navigate to={destination(user, next)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(new Error('Enter your email and password.'));
      return;
    }
    setBusy(true);
    try {
      const signedIn = await signIn(email.trim(), password);
      navigate(destination(signedIn, next), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      intro="For drivers and the office."
      footer={
        <>
          <p>
            Want to drive with us?{' '}
            <Link to="/drivers/apply" className="text-yellow-400 underline font-bold">
              Apply here
            </Link>
          </p>
          <p>
            Broken down?{' '}
            <Link to="/" className="text-yellow-400 underline font-bold">
              Book recovery
            </Link>
          </p>
        </>
      }
    >
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
        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </Field>
        <ErrorNotice error={error} />
        <PrimaryButton type="submit" busy={busy} className="w-full py-3.5">
          Sign in
        </PrimaryButton>
        <Link
          to="/forgot-password"
          className="text-sm text-neutral-400 hover:text-white underline self-start"
        >
          Forgotten your password?
        </Link>
      </form>
    </AuthShell>
  );
}
