// The office. On a fresh install with no admin yet, the first thing shown is
// the one-time setup; after that, every page needs an admin signed in.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Home } from '../../icons';
import { apiFetch } from '../../apiClient';
import { RequireAuth, useAuth } from '../../auth';
import { fetchComplianceReport, listDriverSummaries } from '../../adminApi';
import { FullScreenMessage } from '../../components/console';
import { Logo } from '../../components/Logo';
import { useNoIndex } from '../../seo';
import { AccountPanel } from '../account/AccountPage';
import { AdminAnalytics } from './AdminAnalytics';
import { AdminAudit } from './AdminAudit';
import { AdminBookings } from './AdminBookings';
import { AdminCompliance } from './AdminCompliance';
import { AdminDriverReview } from './AdminDriverReview';
import { AdminDrivers } from './AdminDrivers';
import { AdminSetup } from './AdminSetup';
import { AdminTeam } from './AdminTeam';

export function AdminApp() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ needsSetup: boolean }>('/api/auth/setup')
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (needsSetup === null) return <FullScreenMessage title="Loading" busy />;
  if (needsSetup) return <AdminSetup onDone={() => setNeedsSetup(false)} />;

  return (
    <RequireAuth role="admin">
      <AdminLayout>
        <Routes>
          <Route index element={<AdminBookings />} />
          <Route path="drivers" element={<AdminDrivers />} />
          <Route path="drivers/:id" element={<AdminDriverReview />} />
          <Route path="compliance" element={<AdminCompliance />} />
          <Route path="team" element={<AdminTeam />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="telemetry" element={<Navigate to="/admin/analytics" replace />} />
          <Route path="account" element={<AccountPanel />} />
          <Route
            path="*"
            element={<p className="text-neutral-400 py-10 text-center">That page doesn't exist.</p>}
          />
        </Routes>
      </AdminLayout>
    </RequireAuth>
  );
}

function AdminLayout({ children }: { children: ReactNode }) {
  useNoIndex('Dispatch admin');
  const { user, signOut } = useAuth();
  const [counts, setCounts] = useState({ review: 0, compliance: 0 });

  const loadCounts = useCallback(async () => {
    try {
      const [waiting, rows] = await Promise.all([
        listDriverSummaries('submitted'),
        fetchComplianceReport(),
      ]);
      setCounts({
        review: waiting.length,
        compliance: rows.filter((r) => r.state !== 'expiring').length,
      });
    } catch {
      /* the badges are a nicety */
    }
  }, []);

  useEffect(() => {
    void loadCounts();
    const timer = setInterval(() => void loadCounts(), 60_000);
    return () => clearInterval(timer);
  }, [loadCounts]);

  const nav = [
    { to: '/admin', label: 'Bookings', end: true, badge: 0 },
    { to: '/admin/analytics', label: 'Analytics', end: false, badge: 0 },
    { to: '/admin/drivers', label: 'Drivers', end: false, badge: counts.review },
    { to: '/admin/compliance', label: 'Compliance', end: false, badge: counts.compliance },
    { to: '/admin/team', label: 'Team', end: false, badge: 0 },
    { to: '/admin/audit', label: 'Audit log', end: false, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      <div className="hazard-stripes h-2" aria-hidden="true" />
      <header className="border-b-2 border-yellow-400">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-3 min-w-0">
            <Logo className="w-9 h-9 shrink-0" />
            <div>
              <div className="font-display text-lg tracking-tight text-white uppercase leading-none">
                Dispatch
              </div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
                Admin
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider min-w-0">
            <Link
              to="/"
              className="text-neutral-400 hover:text-yellow-400 inline-flex items-center gap-1.5"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Site</span>
            </Link>
            <Link
              to="/admin/account"
              className="text-neutral-400 hover:text-white truncate max-w-[9rem]"
            >
              {user?.name}
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-neutral-400 hover:text-[var(--color-danger-soft)]"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Admin sections">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wider border-b-4 inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'border-yellow-400 text-white'
                    : 'border-transparent text-neutral-500 hover:text-white'
                }`
              }
            >
              {item.label}
              {item.badge > 0 && (
                <span className="bg-yellow-400 text-neutral-950 px-1.5 min-w-[1.25rem] text-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
