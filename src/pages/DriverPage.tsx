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
import {
  agoLabel,
  DRIVER_KEY_STORAGE,
  fetchDrivers,
  fetchJobs,
  mapsUrl,
  NEXT_STATUS,
  sendPosition,
  setAvailability,
  setJobStatus,
  deleteJob,
  STATUS_STYLE,
  type Driver,
  type Job,
  type JobStatus,
} from '../driver';
import { BRAND_WORDMARK } from '../config';

/** How often to push a new position while on duty. */
const POSITION_INTERVAL_MS = 20_000;
/** How often to re-read jobs, so a new booking appears without a refresh. */
const POLL_MS = 15_000;

/** What each tab shows. "Mine" is the default: it is what the driver is doing. */
const FILTERS = [
  { key: 'mine', label: 'Mine' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const DONE: JobStatus[] = ['complete', 'cancelled'];

export function DriverPage() {
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

  const me = drivers.find((d) => d.id === meId) ?? null;
  const lastSent = useRef(0);

  const load = useCallback(async () => {
    if (!apiKey) return;
    try {
      const [ds, js] = await Promise.all([fetchDrivers(apiKey), fetchJobs(apiKey)]);
      setDrivers(ds);
      setJobs(js);
      setError(null);
      setMeId((current) => (current === null && ds.length > 0 ? ds[0].id : current));
    } catch (err) {
      setError(
        String(err).includes('401')
          ? 'That key was not accepted.'
          : `Could not reach the API at ${API_BASE}.`,
      );
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (meId !== null) localStorage.setItem('driver_id', String(meId));
  }, [meId]);

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

  const advance = async (job: Job) => {
    const step = NEXT_STATUS[job.status];
    if (!step || !me) return;
    setBusy(true);
    try {
      await setJobStatus(apiKey, job.id, step.next, me.id);
      await load();
    } catch {
      setError('Could not update that job. Try again.');
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

  // ── Key entry ────────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="font-display text-3xl uppercase tracking-tight mb-1">
            {BRAND_WORDMARK[0]} <span className="wordmark-paint">{BRAND_WORDMARK[1]}</span>
          </div>
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
        <Link to="/" className="font-display text-xl uppercase tracking-tight">
          {BRAND_WORDMARK[0]} <span className="wordmark-paint">{BRAND_WORDMARK[1]}</span>
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
          {me?.busyMinutes ? (
            <p className="text-xs text-neutral-400 font-medium mt-3 border-t border-neutral-800 pt-3">
              Free again in about <strong className="text-yellow-400">{me.busyMinutes} min</strong>
            </p>
          ) : null}
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

  return (
    <article className={`border-2 ${style.border} bg-neutral-900 ${finished ? 'opacity-60' : ''}`}>
      {job.motorway && !finished && (
        <p className="bg-[var(--color-danger)] text-white text-[11px] font-black uppercase tracking-wider px-4 py-2">
          ⚠ Motorway · live carriageway procedure
        </p>
      )}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold truncate">{job.service}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 ${style.chip}`}
              >
                {style.label}
              </span>
              <span className="text-xs text-neutral-500 font-medium">
                #{job.id}
                {mine && !finished ? ' · yours' : ''}
              </span>
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
            {step && (
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
