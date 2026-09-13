import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Wordmark } from '../../components/Layout';

/** The frame around a driver's pages: the brand, where they can go, who they are. */
export function DriverShell({ title, children }: { title?: string; children: ReactNode }) {
  const { user } = useAuth();
  const working = user?.driverStatus === 'active';
  const nav = working
    ? [
        { to: '/driver', label: 'Jobs', end: true },
        { to: '/driver/documents', label: 'Documents', end: false },
        { to: '/driver/account', label: 'Account', end: false },
      ]
    : [
        { to: '/driver/application', label: 'Application', end: false },
        { to: '/driver/account', label: 'Account', end: false },
      ];

  return (
    <main className="min-h-screen bg-neutral-950 text-white pb-16">
      <header className="border-b-2 border-neutral-800">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3 flex items-center justify-between gap-4">
          <Link to="/" className="min-w-0">
            <Wordmark className="text-lg uppercase block whitespace-nowrap" />
          </Link>
          <span className="text-neutral-400 text-sm font-bold truncate">{user?.name}</span>
        </div>
        <nav className="max-w-2xl mx-auto px-4 flex gap-1" aria-label="Driver">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3.5 py-2.5 text-[12px] font-black uppercase tracking-wider border-b-4 ${
                  isActive
                    ? 'border-yellow-400 text-white'
                    : 'border-transparent text-neutral-500 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="px-4 py-5 max-w-2xl mx-auto flex flex-col gap-4">
        {title && (
          <h1 className="font-display text-3xl uppercase tracking-tight leading-none">{title}</h1>
        )}
        {children}
      </div>
    </main>
  );
}
