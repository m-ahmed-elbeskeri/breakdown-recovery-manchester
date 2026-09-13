// The frame around every signed-in page: who is signed in, and a loading
// state while a page's code arrives. Nothing public sits inside it.

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { AuthProvider } from '../../auth';
import { FullScreenMessage } from '../../components/console';
import { Logo } from '../../components/Logo';
import { Wordmark } from '../../components/Layout';

export function AuthLayout() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullScreenMessage title="Loading" busy />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}

/** A narrow page with one job: sign in, set a password, apply. */
export function AuthShell({
  title,
  intro,
  children,
  footer,
  wide = false,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <div className="hazard-stripes h-2" aria-hidden="true" />
      <header className="px-5 py-4 border-b-2 border-neutral-900">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <Logo className="w-9 h-9 shrink-0" />
          <Wordmark className="text-lg whitespace-nowrap" />
        </Link>
      </header>
      <div className="flex-1 flex items-start sm:items-center justify-center px-5 py-10">
        <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
          <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tight leading-none">
            {title}
          </h1>
          {intro && <p className="text-neutral-400 text-sm mt-3 leading-relaxed">{intro}</p>}
          <div className="mt-6">{children}</div>
          {footer && (
            <div className="mt-6 pt-5 border-t border-neutral-900 text-sm text-neutral-400 flex flex-col gap-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
