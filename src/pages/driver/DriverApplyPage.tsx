// Step one of driving with us: an account. Everything else (licence, truck,
// documents) is asked for afterwards, on their own time, so this page asks
// only for what an account needs.

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../../auth';
import {
  ErrorNotice,
  Field,
  inputClass,
  PasswordInput,
  PrimaryButton,
} from '../../components/console';
import { applyToDrive } from '../../driver';
import { DOC_GROUPS, DOC_TYPES, MINIMUM_AGE } from '../../driverDocs';
import { useNoIndex } from '../../seo';
import { AuthShell } from '../account/AuthLayout';

const RULE_NOTE: Record<string, string> = {
  hgv: 'if your truck is over 3.5 tonnes',
  motorway: 'for motorway work',
  optional: 'optional',
};

export function DriverApplyPage() {
  useNoIndex('Apply to drive');
  const { user, adopt } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      setError(new Error('Fill in every box.'));
      return;
    }
    if (!consent) {
      setError(new Error('Tick the box to agree to how we use your details.'));
      return;
    }
    setBusy(true);
    try {
      const session = await applyToDrive({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        consent,
      });
      adopt(session);
      navigate('/driver/application', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      wide
      title="Drive with us"
      intro="Create your account, then add your details and documents at your own pace. Your progress is saved as you go."
      footer={
        <p>
          Already applied?{' '}
          <Link to="/login" className="text-yellow-400 underline font-bold">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="grid md:grid-cols-[1fr_1fr] gap-8">
        <form onSubmit={submit} className="flex flex-col gap-4 order-1" noValidate>
          <Field label="Full name" htmlFor="name" hint="As it is on your driving licence.">
            <input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email" htmlFor="email" hint="You sign in with this.">
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Mobile number" htmlFor="phone">
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
          <label className="flex items-start gap-3 text-sm text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-yellow-400 shrink-0"
            />
            <span>
              I agree to my details and documents being used to check I can drive for you, as set
              out in the{' '}
              <Link to="/privacy" className="text-yellow-400 underline" target="_blank">
                privacy policy
              </Link>
              .
            </span>
          </label>
          <ErrorNotice error={error} />
          <PrimaryButton type="submit" busy={busy} className="w-full py-3.5">
            Create my account
          </PrimaryButton>
        </form>

        <aside className="border-2 border-neutral-800 bg-neutral-900 p-5 order-2 self-start">
          <h2 className="font-display text-lg uppercase tracking-tight">What you'll need</h2>
          <p className="text-sm text-neutral-400 mt-1">
            You need to be {MINIMUM_AGE} or over, with your own recovery vehicle. Photos from your
            phone are fine for every document.
          </p>
          <div className="flex flex-col gap-4 mt-4">
            {DOC_GROUPS.map((group) => (
              <div key={group.key}>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  {group.label}
                </h3>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {DOC_TYPES.filter((d) => d.group === group.key).map((d) => (
                    <li key={d.key} className="text-sm text-neutral-200">
                      {d.label}
                      {RULE_NOTE[d.rule] && (
                        <span className="text-neutral-500"> ({RULE_NOTE[d.rule]})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </AuthShell>
  );
}
