import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Home, Loader2, Phone, ShieldAlert } from '../icons';
import { Logo } from '../components/Logo';
import { API_BASE } from '../api';
import { TelemetryPanel } from '../components/Telemetry';
import { useNoIndex } from '../seo';

interface AdminBooking {
  id: number;
  region: string;
  location: string;
  destination: string | null;
  phone: string;
  service: string;
  timing: string;
  scheduledFor: string | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  price: number | null;
  status: string;
  createdAt: string;
}

const KEY_STORAGE = 'admin_api_key';
type Status = 'idle' | 'loading' | 'error' | 'unauthorized';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function AdminPage() {
  useNoIndex();
  useEffect(() => {
    document.title = 'Dispatch | Admin';
  }, []);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(KEY_STORAGE) ?? '');
  const [input, setInput] = useState(apiKey);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [tab, setTab] = useState<'bookings' | 'telemetry'>('bookings');

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/api/bookings?limit=100`, {
        headers: { 'x-api-key': key },
      });
      if (res.status === 401) {
        setStatus('unauthorized');
        setBookings(null);
        return;
      }
      if (!res.ok) throw new Error(`bookings ${res.status}`);
      setBookings((await res.json()) as AdminBooking[]);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    load(apiKey);
    const id = setInterval(() => load(apiKey), 20000);
    return () => clearInterval(id);
  }, [apiKey, load]);

  const saveKey = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem(KEY_STORAGE, input.trim());
    setApiKey(input.trim());
  };

  const signOut = () => {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey('');
    setInput('');
    setBookings(null);
    setStatus('idle');
  };

  const needsKey = !apiKey || status === 'unauthorized';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      <header className="hazard-stripes h-2" aria-hidden="true" />
      <div className="border-b-2 border-yellow-400">
        <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="w-10 h-10 shrink-0" />
            <div>
              <div className="font-display text-xl tracking-tight text-white uppercase">
                Dispatch · Bookings
              </div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
                Admin
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-yellow-400 inline-flex items-center gap-1.5"
            >
              <Home className="w-4 h-4" /> Site
            </Link>
            {apiKey && (
              <button
                type="button"
                onClick={signOut}
                className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-red-400"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!needsKey && (
          <nav className="flex gap-1 mb-6" aria-label="Admin sections">
            {(
              [
                ['bookings', 'Bookings'],
                ['telemetry', 'Telemetry'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`px-4 py-2.5 text-[11px] font-black uppercase tracking-wider border-2 ${
                  tab === key
                    ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {!needsKey && tab === 'telemetry' && <TelemetryPanel apiKey={apiKey} />}

        {needsKey ? (
          <form onSubmit={saveKey} className="max-w-md mx-auto mt-16 text-center">
            <ShieldAlert className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
            <h1 className="font-display text-2xl text-white uppercase tracking-tight mb-2">
              Enter admin key
            </h1>
            <p className="text-sm text-neutral-400 mb-6">
              The bookings list contains customer details, so it's protected by the
              <code className="text-neutral-300"> ADMIN_API_KEY</code> from the backend.
            </p>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Admin API key"
              className="w-full py-3 px-4 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-500"
              aria-label="Admin API key"
            />
            {status === 'unauthorized' && (
              <p
                role="alert"
                className="text-red-400 text-xs font-bold uppercase tracking-wider mt-3"
              >
                That key was rejected.
              </p>
            )}
            <button
              type="submit"
              className="w-full mt-4 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-3 rounded-none uppercase tracking-wider transition-colors"
            >
              View bookings
            </button>
          </form>
        ) : tab !== 'bookings' ? null : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h1 className="font-display text-2xl text-white uppercase tracking-tight">
                {bookings
                  ? `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`
                  : 'Bookings'}
              </h1>
              <button
                type="button"
                onClick={() => load(apiKey)}
                className="text-xs font-bold uppercase tracking-wider text-neutral-950 bg-yellow-400 hover:bg-yellow-300 px-4 py-2 rounded-none inline-flex items-center gap-2"
              >
                {status === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Refresh
              </button>
            </div>

            {status === 'error' && (
              <p className="text-red-400 text-sm mb-4">
                Couldn't reach the API at <code>{API_BASE}</code>. Is the backend running?
              </p>
            )}

            {bookings && bookings.length === 0 ? (
              <p className="text-neutral-500 text-center py-16">No bookings yet.</p>
            ) : (
              <div className="overflow-x-auto border-2 border-neutral-800">
                <table className="w-full text-sm min-w-[880px]">
                  <thead>
                    <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                      <th className="p-3 font-bold">Time</th>
                      <th className="p-3 font-bold">Service</th>
                      <th className="p-3 font-bold">Pickup → Drop-off</th>
                      <th className="p-3 font-bold">Phone</th>
                      <th className="p-3 font-bold">Tow</th>
                      <th className="p-3 font-bold">Price</th>
                      <th className="p-3 font-bold">When</th>
                      <th className="p-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings?.map((b) => (
                      <tr
                        key={b.id}
                        className="border-t border-neutral-800 hover:bg-neutral-900/60"
                      >
                        <td className="p-3 text-neutral-400 whitespace-nowrap tabular-nums">
                          {fmtTime(b.createdAt)}
                        </td>
                        <td className="p-3 font-semibold text-white capitalize">{b.service}</td>
                        <td className="p-3 text-neutral-300">
                          {b.location}
                          {b.destination ? (
                            <span className="text-neutral-500"> → {b.destination}</span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <a
                            href={`tel:${b.phone}`}
                            className="text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5" /> {b.phone}
                          </a>
                        </td>
                        <td className="p-3 text-neutral-400 whitespace-nowrap tabular-nums">
                          {b.distanceMiles != null ? `${b.distanceMiles} mi` : '–'}
                        </td>
                        <td className="p-3 font-display text-yellow-400 tabular-nums">
                          {b.price != null ? `£${b.price}` : '–'}
                        </td>
                        <td className="p-3 text-neutral-400 whitespace-nowrap">
                          {b.timing === 'now' ? 'ASAP' : (b.scheduledFor ?? 'Scheduled')}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-800 text-neutral-300 px-2 py-1 rounded-none">
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
