// The driver's console: on duty or off, where they are, and the job in hand.
//
// Designed for a phone in a cab rather than a desk. Big targets, one obvious
// action per job, and the state visible at a glance — a driver reading this at
// the roadside in the rain should never have to hunt for the next tap.
//
// Location is only shared while on duty. Going off duty stops the watch, which
// is the point: a driver who is not working is not being tracked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../api';
import { Bell, Star } from '../icons';
import {
  agoLabel,
  whenLabel,
  diffJobs,
  DRIVER_KEY_STORAGE,
  fetchDrivers,
  fetchJobs,
  mapsUrl,
  NEXT_STATUS,
  sendPosition,
  setAvailability,
  setBusyMinutes,
  setJobStatus,
  deleteJob,
  STATUS_STYLE,
  type Driver,
  type Job,
  type JobStatus,
} from '../driver';
import { serviceLabel } from '../data';
import { Wordmark } from '../components/Layout';
import { InstallApp } from '../components/InstallApp';
import { useNoIndex } from '../seo';

/** How often to push a new position while on duty. */
const POSITION_INTERVAL_MS = 20_000;
/** How often to re-read jobs, so a new booking appears without a refresh. */
const POLL_MS = 10_000;

/** What each tab shows. "Mine" is the default: it is what the driver is doing. */
const FILTERS = [
  { key: 'mine', label: 'Mine' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const DONE: JobStatus[] = ['complete', 'cancelled'];

interface Alert {
  id: string;
  kind: 'new' | 'cancelled';
  text: string;
}

/**
 * Make the phone say something. A job appearing silently in a list on a
 * phone in a cup holder is a job that gets missed; a taxi app buzzes and so
 * does this. The chime is synthesised so there is no audio file to fail to
 * load in a blackspot.
 */
function buzz(kind: Alert['kind']) {
  try {
    navigator.vibrate?.(kind === 'new' ? [250, 120, 250] : [500]);
  } catch {
    /* not supported */
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = kind === 'new' ? [880, 1175] : [440];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    /* audio blocked until the first tap; the vibration and banner still fire */
  }
}

function systemNotify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png', tag: title });
    }
  } catch {
    /* not supported */
  }
}

export function DriverPage() {
  useNoIndex('Driver console');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(DRIVER_KEY_STORAGE) ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [meId, setMeId] = useState<number | null>(() => {
    const saved = localStorage.getItem('driver_id');
    return saved ? Number(saved) : null;
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('mine');
  // Two taps to delete. A single button next to "Job done" on a phone in a
  // moving cab is a job lost to a misplaced thumb.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'unsupported'>(
    () => ('Notification' in window ? Notification.permission : 'unsupported'),
  );

  const me = drivers.find((d) => d.id === meId) ?? null;
  const lastSent = useRef(0);
  const previousJobs = useRef<Job[] | null>(null);

  const load = useCallback(async () => {
    if (!apiKey) return;
    try {
      const [ds, js] = await Promise.all([fetchDrivers(apiKey), fetchJobs(apiKey)]);
      setDrivers(ds);
      setJobs(js);
      setError(null);
      setMeId((current) => (current === null && ds.length > 0 ? ds[0].id : current));

      const { newWaiting, cancelledOnMe } = diffJobs(previousJobs.current, js, meId);
      previousJobs.current = js;
      if (newWaiting.length > 0) {
        buzz('new');
        const text =
          newWaiting.length === 1
            ? `New job: ${serviceLabel(newWaiting[0].service)} at ${newWaiting[0].location}`
            : `${newWaiting.length} new jobs waiting`;
        systemNotify('New job waiting', text);
        setAlerts((a) => [...a, { id: `new-${Date.now()}`, kind: 'new', text }]);
      }
      for (const job of cancelledOnMe) {
        buzz('cancelled');
        const text = `Customer cancelled job #${job.id} (${job.location}). Stand down.`;
        systemNotify('Job cancelled', text);
        setAlerts((a) => [...a, { id: `cancel-${job.id}`, kind: 'cancelled', text }]);
      }
    } catch (err) {
      setError(
        String(err).includes('401')
          ? 'That key was not accepted.'
          : `Could not reach the API at ${API_BASE}.`,
      );
    }
  }, [apiKey, meId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Reflect the alert count in the tab title, where a driver glancing at a
  // phone full of other apps will see it.
  useEffect(() => {
    document.title = alerts.length > 0 ? `(${alerts.length}) Driver console` : 'Driver console';
  }, [alerts.length]);

  useEffect(() => {
    if (meId !== null) localStorage.setItem('driver_id', String(meId));
  }, [meId]);

  // Registered here rather than site-wide: the offline shell exists for a
  // driver in a signal blackspot, and nobody else needs a worker installed.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an unregistered worker costs offline support, nothing else */
    });
  }, []);

  // Share location only while on duty. Throttled, because a phone reports
  // movement far more often than dispatch needs to know about it.
  useEffect(() => {
    if (!apiKey || !me?.available || !('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        const now = Date.now();
        if (now - lastSent.current < POSITION_INTERVAL_MS) return;
        lastSent.current = now;
        void sendPosition(apiKey, me.id, pos.coords.latitude, pos.coords.longitude)
          .then((d) => setDrivers((all) => all.map((x) => (x.id === d.id ? d : x))))
          .catch(() => {
            /* a dropped position is not worth interrupting the driver over */
          });
      },
      () => setGeoError('Location is off. Turn it on so customers get a real ETA.'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [apiKey, me?.available, me?.id]);

  const toggleDuty = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const updated = await setAvailability(apiKey, me.id, !me.available);
      setDrivers((all) => all.map((d) => (d.id === updated.id ? updated : d)));
      lastSent.current = 0; // send a position immediately on coming on duty
    } catch {
      setError('Could not change your status. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Nudge the free-at time. The estimate made when a job was taken is a
  // guess from mileage; the driver can see the recovery and knows whether it
  // is another ten minutes or another hour. Every waiting customer's quoted
  // wait is built on this number, so it is worth letting them correct it.
  const nudgeBusy = async (delta: number) => {
    if (!me) return;
    const next = Math.max(0, Math.min(480, me.busyMinutes + delta));
    setBusy(true);
    try {
      const updated = await setBusyMinutes(apiKey, me.id, next);
      setDrivers((all) => all.map((d) => (d.id === updated.id ? updated : d)));
    } catch {
      setError('Could not update your free time. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const advance = async (job: Job) => {
    const step = NEXT_STATUS[job.status];
    if (!step || !me) return;
    setBusy(true);
    try {
      await setJobStatus(apiKey, job.id, step.next, me.id);
      await load();
    } catch (err) {
      setError(
        String(err).includes('409')
          ? 'That job is no longer yours to take. Refreshing.'
          : 'Could not update that job. Try again.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (job: Job) => {
    setBusy(true);
    try {
      await deleteJob(apiKey, job.id);
      setConfirmDelete(null);
      await load();
    } catch {
      setError('Could not delete that job. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const askNotifications = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifyPermission(result);
  };

  // ── Key entry ────────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <Wordmark className="text-3xl uppercase block mb-1" />
          <p className="text-neutral-400 text-sm mb-6">Driver console</p>
          <label
            htmlFor="key"
            className="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-2"
          >
            Operator key
          </label>
          <input
            id="key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-full px-4 py-3.5 bg-neutral-900 border-2 border-neutral-800 focus:border-yellow-400 outline-none text-white font-medium"
            placeholder="Paste your key"
          />
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(DRIVER_KEY_STORAGE, keyInput.trim());
              setApiKey(keyInput.trim());
            }}
            className="w-full mt-3 bg-yellow-400 text-neutral-950 font-display py-3.5 uppercase tracking-wider"
          >
            Sign in
          </button>
          <p className="text-neutral-500 text-xs mt-4">
            Entered once and remembered on this phone.
          </p>
        </div>
      </main>
    );
  }

  const myJobs = jobs.filter((j) => j.driverId === meId && !DONE.includes(j.status));

  const counts = {
    mine: myJobs.length,
    waiting: jobs.filter((j) => j.status === 'pending' && j.driverId === null).length,
    done: jobs.filter((j) => DONE.includes(j.status)).length,
    all: jobs.length,
  };

  const visible = jobs.filter((j) => {
    if (filter === 'mine') return j.driverId === meId && !DONE.includes(j.status);
    if (filter === 'waiting') return j.status === 'pending' && j.driverId === null;
    if (filter === 'done') return DONE.includes(j.status);
    return true;
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-white pb-16">
      <header className="border-b-2 border-neutral-800 px-5 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="min-w-0">
          <Wordmark className="text-xl uppercase block whitespace-nowrap" />
        </Link>
        {drivers.length > 1 ? (
          <select
            value={meId ?? ''}
            onChange={(e) => setMeId(Number(e.target.value))}
            className="bg-neutral-900 border-2 border-neutral-800 px-3 py-2 text-sm font-bold"
            aria-label="Which driver are you"
          >
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-neutral-400 text-sm font-bold">{me?.name}</span>
        )}
      </header>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="border-2 border-[var(--color-danger-soft)] text-[var(--color-danger-soft)] px-4 py-3 text-sm font-bold"
          >
            {error}
          </p>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            role="status"
            className={`border-2 px-4 py-3 flex items-start gap-3 ${
              alert.kind === 'new'
                ? 'border-yellow-400 bg-yellow-400 text-neutral-950'
                : 'border-[var(--color-danger)] bg-[var(--color-danger)] text-white'
            }`}
          >
            <Bell className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-bold flex-1">{alert.text}</p>
            <button
              type="button"
              onClick={() => {
                setAlerts((a) => a.filter((x) => x.id !== alert.id));
                if (alert.kind === 'new') setFilter('waiting');
              }}
              className="shrink-0 font-display uppercase tracking-wider text-xs underline"
            >
              {alert.kind === 'new' ? 'View' : 'OK'}
            </button>
          </div>
        ))}

        {drivers.length === 0 && !error && (
          <p className="border-2 border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
            No drivers on the roster yet. Add one in the{' '}
            <Link to="/admin" className="text-yellow-400 underline">
              admin page
            </Link>{' '}
            and come back.
          </p>
        )}

        <InstallApp />

        {notifyPermission === 'default' && (
          <button
            type="button"
            onClick={askNotifications}
            className="border-2 border-neutral-800 bg-neutral-900 px-4 py-3 text-left flex items-center gap-3"
          >
            <Bell className="w-5 h-5 text-yellow-400 shrink-0" />
            <span className="text-sm">
              <span className="font-bold block">Turn on job alerts</span>
              <span className="text-neutral-400 text-[12px]">
                Get a notification when a new job comes in, even with the screen off.
              </span>
            </span>
          </button>
        )}

        {/* ── On duty ─────────────────────────────────────────────────── */}
        <section
          className={`border-2 p-5 ${me?.available ? 'border-yellow-400 bg-yellow-400/10' : 'border-neutral-800 bg-neutral-900'}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-display text-2xl uppercase leading-none">
                {me?.available ? 'On duty' : 'Off duty'}
              </div>
              <p className="text-xs text-neutral-400 font-medium mt-1.5">
                {me?.available
                  ? `Sharing location · ${agoLabel(me.locatedAt)}`
                  : 'Not taking jobs. Location is not shared.'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleDuty}
              disabled={busy || !me}
              aria-pressed={!!me?.available}
              className={`shrink-0 px-5 py-3.5 font-display uppercase tracking-wider border-2 ${
                me?.available
                  ? 'bg-neutral-950 text-white border-neutral-700'
                  : 'bg-yellow-400 text-neutral-950 border-yellow-400'
              }`}
            >
              {me?.available ? 'Go off' : 'Go on'}
            </button>
          </div>
          {geoError && me?.available && (
            <p className="text-[var(--color-danger-soft)] text-xs font-bold mt-3">{geoError}</p>
          )}
          {me && (
            <div className="mt-3 border-t border-neutral-800 pt-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-neutral-400 font-medium">
                {me.busyMinutes > 0 ? (
                  <>
                    Free again in about{' '}
                    <strong className="text-yellow-400 font-display text-base">
                      {me.busyMinutes} min
                    </strong>
                  </>
                ) : (
                  <>
                    Free <strong className="text-yellow-400">now</strong>
                  </>
                )}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void nudgeBusy(-15)}
                  disabled={busy || me.busyMinutes === 0}
                  aria-label="Fifteen minutes sooner"
                  className="px-3 py-2 bg-neutral-800 text-white font-display text-xs uppercase tracking-wider disabled:opacity-40"
                >
                  −15
                </button>
                <button
                  type="button"
                  onClick={() => void nudgeBusy(15)}
                  disabled={busy}
                  aria-label="Fifteen minutes longer"
                  className="px-3 py-2 bg-neutral-800 text-white font-display text-xs uppercase tracking-wider disabled:opacity-40"
                >
                  +15
                </button>
                <button
                  type="button"
                  onClick={() => void nudgeBusy(-me.busyMinutes)}
                  disabled={busy || me.busyMinutes === 0}
                  aria-label="I am free now"
                  className="px-3 py-2 border-2 border-neutral-700 text-neutral-300 font-display text-xs uppercase tracking-wider disabled:opacity-40"
                >
                  Free now
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Jobs ────────────────────────────────────────────────────── */}
        <nav className="flex gap-1" aria-label="Filter jobs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider border-2 transition-colors ${
                filter === f.key
                  ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          {visible.length === 0 ? (
            <p className="text-neutral-500 text-sm border-2 border-neutral-900 px-4 py-8 text-center">
              {filter === 'mine'
                ? 'You have no jobs on. Check Waiting.'
                : filter === 'waiting'
                  ? 'No jobs waiting.'
                  : 'Nothing here yet.'}
            </p>
          ) : (
            visible.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onAdvance={advance}
                onDelete={remove}
                confirming={confirmDelete === job.id}
                onConfirmDelete={() => setConfirmDelete(job.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                busy={busy}
                mine={job.driverId === meId}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function JobCard({
  job,
  onAdvance,
  onDelete,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  busy,
  mine = false,
}: {
  job: Job;
  onAdvance: (job: Job) => void;
  onDelete: (job: Job) => void;
  confirming: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  busy: boolean;
  mine?: boolean;
}) {
  const step = NEXT_STATUS[job.status];
  const style = STATUS_STYLE[job.status];
  const finished = job.status === 'complete' || job.status === 'cancelled';
  // Someone else's live job: shown for awareness, but not something to act on.
  const someoneElses = !mine && job.driverId !== null && !finished;

  return (
    <article className={`border-2 ${style.border} bg-neutral-900 ${finished ? 'opacity-60' : ''}`}>
      {job.motorway && !finished && (
        <p className="bg-[var(--color-danger)] text-white text-[11px] font-black uppercase tracking-wider px-4 py-2">
          ⚠ Motorway · live carriageway procedure
        </p>
      )}
      {job.status === 'cancelled' && job.cancelledBy === 'customer' && (
        <p className="bg-neutral-800 text-neutral-300 text-[11px] font-black uppercase tracking-wider px-4 py-2">
          Cancelled by the customer
        </p>
      )}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold truncate">{serviceLabel(job.service)}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 ${style.chip}`}
              >
                {style.label}
              </span>
              <span className="text-xs text-neutral-500 font-medium">
                #{job.id}
                {mine && !finished ? ' · yours' : ''}
                {someoneElses && job.driverName ? ` · ${job.driverName}` : ''}
              </span>
              {job.rating !== null && (
                <span
                  className="inline-flex items-center gap-0.5 text-yellow-400"
                  aria-label={`Rated ${job.rating} out of 5`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`w-3 h-3 ${n <= (job.rating ?? 0) ? 'fill-yellow-400' : 'opacity-30'}`}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
          <div
            className={`font-display text-2xl leading-none shrink-0 ${finished ? 'text-neutral-500' : 'text-yellow-400'}`}
          >
            {job.price !== null ? `£${job.price}` : '—'}
          </div>
        </div>

        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
            When
          </dt>
          <dd
            className={`font-bold ${job.timing === 'later' && !finished ? 'text-yellow-400' : ''}`}
          >
            {whenLabel(job)}
          </dd>
          <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
            Pickup
          </dt>
          <dd>
            <a
              href={mapsUrl(job)}
              target="_blank"
              rel="noreferrer"
              className="text-yellow-400 underline font-medium break-words"
            >
              {job.location}
            </a>
            {job.pickupLat === null && (
              <span className="block text-[11px] text-neutral-500">searched by address</span>
            )}
          </dd>
          {job.destination && (
            <>
              <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
                Drop-off
              </dt>
              <dd className="break-words">{job.destination}</dd>
            </>
          )}
          {job.vehicle && (
            <>
              <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
                Vehicle
              </dt>
              <dd className="break-words font-bold">{job.vehicle}</dd>
            </>
          )}
          <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
            Phone
          </dt>
          <dd>
            <a
              href={`tel:${job.phone.replace(/[^\d+]/g, '')}`}
              className="text-yellow-400 underline font-medium"
            >
              {job.phone}
            </a>
          </dd>
          {job.distanceMiles !== null && (
            <>
              <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
                Tow
              </dt>
              <dd>
                {job.distanceMiles} mi · ~{job.durationMinutes} min
              </dd>
            </>
          )}
          {job.ratingComment && (
            <>
              <dt className="text-neutral-500 text-xs font-bold uppercase tracking-wider pt-0.5">
                Said
              </dt>
              <dd className="italic text-neutral-300">“{job.ratingComment}”</dd>
            </>
          )}
        </dl>

        {confirming ? (
          <div className="flex gap-2 items-center">
            <span className="text-[11px] font-bold text-[var(--color-danger-soft)] flex-1">
              Delete #{job.id} for good?
            </span>
            <button
              type="button"
              onClick={onCancelDelete}
              className="px-4 py-2.5 bg-neutral-800 text-white font-display uppercase tracking-wider text-xs"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => onDelete(job)}
              disabled={busy}
              className="px-4 py-2.5 bg-[var(--color-danger)] text-white font-display uppercase tracking-wider text-xs disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {!finished && (
              <a
                href={mapsUrl(job)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center bg-neutral-800 text-white font-display py-3 uppercase tracking-wider text-sm"
              >
                Navigate
              </a>
            )}
            {step && !someoneElses && (
              <button
                type="button"
                onClick={() => onAdvance(job)}
                disabled={busy}
                className="flex-1 bg-yellow-400 text-neutral-950 font-display py-3 uppercase tracking-wider text-sm disabled:opacity-50"
              >
                {step.label}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirmDelete}
              aria-label={`Delete job ${job.id}`}
              className="px-4 py-3 border-2 border-neutral-800 text-neutral-500 hover:text-[var(--color-danger-soft)] hover:border-[var(--color-danger-soft)] font-display uppercase tracking-wider text-sm"
            >
              Del
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
