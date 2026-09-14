// Who is signed in, for the pages that need to know: the driver console, the
// driver application and the admin.
//
// Mounted only around those routes, never around the public site, so the
// prerendered pages never touch localStorage or wait on a network call.
/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError, apiFetch, getToken, setToken, SIGNED_OUT_EVENT } from './apiClient';
import { FullScreenMessage, PrimaryButton, SecondaryButton } from './components/console';
import { markInternalBrowser } from './telemetry';

export type Role = 'admin' | 'driver';
export type DriverStatus = 'draft' | 'submitted' | 'active' | 'rejected' | 'suspended';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  driverId: number | null;
  driverStatus: DriverStatus | null;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: User;
}

type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'offline';

interface AuthValue {
  user: User | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<User>;
  /** Start using a session the API just handed back (apply, reset, setup). */
  adopt: (session: Session) => User;
  signOut: (everywhere?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The shared keys everybody used to paste in. Removed from every browser that still holds one. */
const LEGACY_KEYS = ['driver_api_key', 'admin_api_key', 'driver_id'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('signed-out');
      return;
    }
    try {
      setUser(await apiFetch<User>('/api/auth/me'));
      setStatus('signed-in');
      // Staff and drivers are not customers; keep their visits out of the analytics.
      markInternalBrowser();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setUser(null);
        setStatus('signed-out');
      } else {
        // No signal. A driver in a blackspot is not signed out; keep the
        // session and try again shortly.
        setStatus((current) => (current === 'signed-in' ? current : 'offline'));
      }
    }
  }, []);

  useEffect(() => {
    try {
      LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* storage unavailable */
    }
    void refresh();
    const onSignedOut = () => {
      setUser(null);
      setStatus('signed-out');
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [refresh]);

  useEffect(() => {
    if (status !== 'offline') return;
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  const adopt = useCallback((session: Session) => {
    setToken(session.token);
    markInternalBrowser();
    setUser(session.user);
    setStatus('signed-in');
    return session.user;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) =>
      adopt(
        await apiFetch<Session>('/api/auth/login', {
          method: 'POST',
          json: { email, password },
        }),
      ),
    [adopt],
  );

  const signOut = useCallback(async (everywhere = false) => {
    try {
      await apiFetch(everywhere ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST' });
    } catch {
      /* signing out locally is what matters */
    }
    setToken(null);
    setUser(null);
    setStatus('signed-out');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, signIn, adopt, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Where a person lands after signing in. */
export function homeFor(user: User): string {
  if (user.role === 'admin') return '/admin';
  return user.driverStatus === 'active' ? '/driver' : '/driver/application';
}

/** Only render children for a signed-in person with this role. */
export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const { user, status, signOut, refresh } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullScreenMessage title="Loading" busy />;
  }
  if (status === 'offline') {
    return (
      <FullScreenMessage
        title="No connection"
        actions={<PrimaryButton onClick={() => void refresh()}>Try again</PrimaryButton>}
      >
        You're still signed in. This page will reconnect when you have signal.
      </FullScreenMessage>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (user.role !== role) {
    return (
      <FullScreenMessage
        title="Wrong account"
        actions={
          <>
            <PrimaryButton to={homeFor(user)}>Go to my page</PrimaryButton>
            <SecondaryButton onClick={() => void signOut()}>Sign out</SecondaryButton>
          </>
        }
      >
        You're signed in as {user.email}, which is {user.role === 'admin' ? 'an admin' : 'a driver'}{' '}
        account. This page is for {role === 'admin' ? 'the office' : 'drivers'}.
      </FullScreenMessage>
    );
  }
  return <>{children}</>;
}
