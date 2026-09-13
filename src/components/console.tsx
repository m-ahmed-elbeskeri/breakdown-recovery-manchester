// The building blocks of the signed-in pages: the driver console, the driver
// application and the admin. Dark, high-contrast and big-targeted, because
// half of these screens are used on a phone in a cab.
/* eslint-disable react-refresh/only-export-components */

import { useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Loader2 } from '../icons';
import { ApiError } from '../apiClient';
import { Logo } from './Logo';

export const inputClass =
  'w-full px-3.5 py-3 bg-neutral-950 border-2 border-neutral-800 focus:border-yellow-400 outline-none text-white text-[15px] font-medium placeholder:text-neutral-500 disabled:opacity-60';

export const labelClass =
  'block text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[12px] text-neutral-500 leading-snug">{hint}</p>}
      {error && (
        <p role="alert" className="text-[12px] font-bold text-[var(--color-danger-soft)]">
          {error}
        </p>
      )}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { to?: string; busy?: boolean };

function makeButton(base: string) {
  return function Button({ to, busy, children, className = '', disabled, ...rest }: ButtonProps) {
    const classes = `${base} ${className}`;
    const content = (
      <>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </>
    );
    if (to) {
      return (
        <Link to={to} className={classes}>
          {content}
        </Link>
      );
    }
    return (
      <button type="button" className={classes} disabled={disabled || busy} {...rest}>
        {content}
      </button>
    );
  };
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 px-5 py-3 font-display uppercase tracking-wider text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const PrimaryButton = makeButton(
  `${buttonBase} bg-yellow-400 hover:bg-yellow-300 text-neutral-950`,
);
export const SecondaryButton = makeButton(
  `${buttonBase} bg-neutral-900 hover:bg-neutral-800 text-white border-2 border-neutral-700`,
);
export const DangerButton = makeButton(
  `${buttonBase} bg-[var(--color-danger)] hover:brightness-110 text-white`,
);

type Tone = 'info' | 'warn' | 'danger' | 'success' | 'neutral';

const TONE: Record<Tone, string> = {
  info: 'border-[var(--color-navy-400)] bg-[var(--color-navy-900)] text-white',
  warn: 'border-yellow-400 bg-yellow-400/10 text-white',
  danger: 'border-[var(--color-danger-soft)] bg-[var(--color-danger)]/15 text-white',
  success: 'border-[var(--color-success)] bg-[var(--color-success)]/15 text-white',
  neutral: 'border-neutral-800 bg-neutral-900 text-white',
};

export function Banner({
  tone = 'neutral',
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      className={`border-2 px-4 py-3.5 ${TONE[tone]}`}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      {title && (
        <div className="font-display text-lg uppercase tracking-tight leading-tight">{title}</div>
      )}
      {children && <div className="text-sm text-neutral-300 mt-1 leading-relaxed">{children}</div>}
      {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
    </section>
  );
}

export function BlockerList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 mt-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-neutral-200">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Show whatever went wrong, including the API's list of things to fix. */
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const blockers = error instanceof ApiError ? error.blockers : [];
  return (
    <Banner tone="danger" title={blockers.length ? message : undefined}>
      {blockers.length ? <BlockerList items={blockers} /> : message}
    </Banner>
  );
}

const CHIP: Record<Tone, string> = {
  info: 'bg-[var(--color-navy-700)] text-white',
  warn: 'bg-yellow-400 text-neutral-950',
  danger: 'bg-[var(--color-danger)] text-white',
  success: 'bg-[var(--color-success)] text-white',
  neutral: 'bg-neutral-800 text-neutral-300',
};

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 whitespace-nowrap ${CHIP[tone]}`}
    >
      {tone === 'success' && <Check className="w-3 h-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function FullScreenMessage({
  title,
  children,
  actions,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
      <div className="w-full max-w-sm text-center flex flex-col items-center gap-4">
        <Logo className="w-12 h-12" />
        <h1 className="font-display text-2xl uppercase tracking-tight flex items-center gap-2">
          {busy && <Loader2 className="w-5 h-5 animate-spin" />}
          {title}
        </h1>
        {children && <p className="text-neutral-400 text-sm leading-relaxed">{children}</p>}
        {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </main>
  );
}

export function Card({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-2 border-neutral-800 bg-neutral-900 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-neutral-800">
          {title && (
            <h2 className="font-display text-base uppercase tracking-tight text-white">{title}</h2>
          )}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A label and value pair, for read-only details. */
export function Detail({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-white break-words">
        {empty ? <span className="text-neutral-600">Not given</span> : children}
      </dd>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="text-neutral-400 text-sm flex items-center gap-2 py-6">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </p>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${inputClass} pr-20`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-white px-2 py-1"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', text);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-yellow-400 hover:text-yellow-300"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

/** A one-time link to hand to someone, with a way to copy it. */
export function LinkBox({ url, note }: { url: string; note?: ReactNode }) {
  return (
    <div className="border-2 border-yellow-400 bg-yellow-400/10 p-3 flex flex-col gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        className={`${inputClass} text-[13px]`}
        aria-label="Link"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {note && <p className="text-[12px] text-neutral-300">{note}</p>}
        <CopyButton text={url} />
      </div>
    </div>
  );
}
