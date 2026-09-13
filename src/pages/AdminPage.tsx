import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Home, Loader2, Phone, ShieldAlert, Star, Copy, Check } from '../icons';
import { Logo } from '../components/Logo';
import { API_BASE } from '../api';
import { SITE_URL, trackPath } from '../config';
import { serviceLabel } from '../data';
import {
  agoLabel,
  createDriver,
  fetchDrivers,
  retireDriver,
  whenLabel,
  type Driver,
  type Job,
} from '../driver';
import { TelemetryPanel } from '../components/Telemetry';
import { useNoIndex } from '../seo';

const KEY_STORAGE = 'admin_api_key';
type Status = 'idle' | 'loading' | 'error' | 'unauthorized';
type Tab = 'bookings' | 'drivers' | 'telemetry';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** Minutes between two timestamps, for "how long did that take". */
const minutesBetween = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
};

export function AdminPage() {
  useNoIndex('Dispatch admin');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(KEY_STORAGE) ?? '');
  const [input, setInput] = useState(apiKey);
  const [bookings, setBookings] = useState<Job[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [tab, setTab] = useState<Tab>('bookings');

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
      setBookings((await res.json()) as Job[]);
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
                Dispatch
              </div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
                Admin
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/driver"
              className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-yellow-400"
            >
              Driver console
            </Link>
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
                ['drivers', 'Drivers'],
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
        {!needsKey && tab === 'drivers' && <DriversPanel apiKey={apiKey} />}

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
                <table className="w-full text-sm min-w-[1100px]">
                  <thead>
                    <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                      <th className="p-3 font-bold">Time</th>
                      <th className="p-3 font-bold">Service</th>
                      <th className="p-3 font-bold">Pickup → Drop-off</th>
                      <th className="p-3 font-bold">Vehicle</th>
                      <th className="p-3 font-bold">Phone</th>
                      <th className="p-3 font-bold">Price</th>
                      <th className="p-3 font-bold">When</th>
                      <th className="p-3 font-bold">Driver</th>
                      <th className="p-3 font-bold">Status</th>
                      <th className="p-3 font-bold">Track</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings?.map((b) => {
                      const response = minutesBetween(b.createdAt, b.onSceneAt);
                      return (
                        <tr
                          key={b.id}
                          className="border-t border-neutral-800 hover:bg-neutral-900/60 align-top"
                        >
                          <td className="p-3 text-neutral-400 whitespace-nowrap tabular-nums">
                            {fmtTime(b.createdAt)}
                            <span className="block text-[10px] text-neutral-600">#{b.id}</span>
                          </td>
                          <td className="p-3 font-semibold text-white">
                            {serviceLabel(b.service)}
                            {b.motorway && (
                              <span className="block text-[10px] text-red-400 font-black uppercase">
                                Motorway
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-neutral-300">
                            {b.location}
                            {b.destination ? (
                              <span className="text-neutral-500"> → {b.destination}</span>
                            ) : null}
                          </td>
                          <td className="p-3 text-neutral-300">{b.vehicle ?? '–'}</td>
                          <td className="p-3">
                            <a
                              href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}
                              className="text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Phone className="w-3.5 h-3.5" /> {b.phone}
                            </a>
                          </td>
                          <td className="p-3 font-display text-yellow-400 tabular-nums">
                            {b.price != null ? `£${b.price}` : '–'}
                          </td>
                          <td className="p-3 text-neutral-400 whitespace-nowrap">{whenLabel(b)}</td>
                          <td className="p-3 text-neutral-300 whitespace-nowrap">
                            {b.driverName ?? '–'}
                            {response !== null && (
                              <span className="block text-[10px] text-neutral-500">
                                on scene in {response} min
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-800 text-neutral-300 px-2 py-1 rounded-none whitespace-nowrap">
                              {b.status.replace('_', ' ')}
                              {b.cancelledBy ? ` · ${b.cancelledBy}` : ''}
                            </span>
                            {b.rating !== null && (
                              <span
                                className="mt-1.5 flex items-center gap-0.5 text-yellow-400"
                                aria-label={`Rated ${b.rating} out of 5`}
                                title={b.ratingComment ?? undefined}
                              >
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star
                                    key={n}
                                    className={`w-3 h-3 ${n <= (b.rating ?? 0) ? 'fill-yellow-400' : 'opacity-30'}`}
                                  />
                                ))}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {b.trackToken ? <CopyTrackLink token={b.trackToken} /> : '–'}
                          </td>
                        </tr>
                      );
                    })}
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

/** The customer's tracking link, for texting to someone who booked by phone. */
function CopyTrackLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  // Where this admin page is served from, so the link works before the
  // canonical domain is pointed at the site.
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  const url = `${origin}${trackPath(token)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Tracking link', url);
    }
  };
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <a
        href={trackPath(token)}
        target="_blank"
        rel="noreferrer"
        className="text-yellow-400 hover:text-yellow-300 underline text-xs"
      >
        Open
      </a>
      <button
        type="button"
        onClick={copy}
        className="text-neutral-400 hover:text-white inline-flex items-center gap-1 text-xs"
        aria-label="Copy tracking link"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** The roster: who drives, whether they are on, and adding or retiring one. */
function DriversPanel({ apiKey }: { apiKey: string }) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setDrivers(await fetchDrivers(apiKey));
      setError(null);
    } catch {
      setError('Could not load drivers.');
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20000);
    return () => clearInterval(id);
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createDriver(apiKey, name.trim(), phone);
      setName('');
      setPhone('');
      await load();
    } catch {
      setError('Could not add that driver.');
    } finally {
      setBusy(false);
    }
  };

  const retire = async (id: number) => {
    setBusy(true);
    try {
      await retireDriver(apiKey, id);
      setConfirmRetire(null);
      await load();
    } catch {
      setError('Could not remove that driver.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl uppercase tracking-tight text-white">Drivers</h2>
        <p className="text-[12px] text-neutral-500 mt-1">
          Everyone here can sign into the driver console with the operator key and pick their name.
          Only drivers who are on duty with a recent position are used for live ETAs.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}

      {drivers === null ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : drivers.length === 0 ? (
        <p className="text-neutral-500 text-sm border-2 border-neutral-900 px-4 py-6 text-center">
          No drivers yet. Add the first one below.
        </p>
      ) : (
        <div className="overflow-x-auto border-2 border-neutral-800">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="p-3 font-bold">Name</th>
                <th className="p-3 font-bold">Phone</th>
                <th className="p-3 font-bold">Duty</th>
                <th className="p-3 font-bold">Position</th>
                <th className="p-3 font-bold">Job in hand</th>
                <th className="p-3 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-t border-neutral-800">
                  <td className="p-3 font-semibold text-white">{d.name}</td>
                  <td className="p-3 text-neutral-300">{d.phone ?? '–'}</td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 ${d.available ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-800 text-neutral-400'}`}
                    >
                      {d.available ? 'On duty' : 'Off'}
                    </span>
                  </td>
                  <td className="p-3 text-neutral-400 whitespace-nowrap">
                    {d.lat !== null ? agoLabel(d.locatedAt) : 'none'}
                  </td>
                  <td className="p-3 text-neutral-400 whitespace-nowrap">
                    {d.currentBookingId !== null ? `#${d.currentBookingId}` : '–'}
                    {d.busyMinutes > 0 ? ` · free in ${d.busyMinutes} min` : ''}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {confirmRetire === d.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[11px] text-red-400 font-bold">Remove {d.name}?</span>
                        <button
                          type="button"
                          onClick={() => setConfirmRetire(null)}
                          className="text-xs px-3 py-1.5 bg-neutral-800 text-white font-display uppercase tracking-wider"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => retire(d.id)}
                          disabled={busy}
                          className="text-xs px-3 py-1.5 bg-[var(--color-danger)] text-white font-display uppercase tracking-wider disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRetire(d.id)}
                        className="text-xs text-neutral-500 hover:text-red-400 font-bold uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={add}
        className="border-2 border-neutral-800 bg-neutral-900 p-4 flex flex-col sm:flex-row gap-3 sm:items-end"
      >
        <label className="flex-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="mt-1.5 w-full px-3 py-2.5 bg-neutral-950 border-2 border-neutral-800 focus:border-yellow-400 outline-none text-white text-sm font-medium normal-case tracking-normal"
            placeholder="Dave"
          />
        </label>
        <label className="flex-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
          Phone (optional, shown to the customer)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            inputMode="tel"
            className="mt-1.5 w-full px-3 py-2.5 bg-neutral-950 border-2 border-neutral-800 focus:border-yellow-400 outline-none text-white text-sm font-medium normal-case tracking-normal"
            placeholder="07700 900123"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="bg-yellow-400 text-neutral-950 font-display px-6 py-2.5 uppercase tracking-wider disabled:opacity-50"
        >
          Add driver
        </button>
      </form>
    </section>
  );
}
