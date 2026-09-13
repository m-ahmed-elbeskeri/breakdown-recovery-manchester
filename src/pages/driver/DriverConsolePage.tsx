// The driver's console: on duty or off, where they are, and the job in hand.
//
// Designed for a phone in a cab rather than a desk. Big targets, one obvious
// action per job, and the state visible at a glance.
//
// Location is only shared while on duty, and the API ignores a position sent
// while off duty anyway. A driver who is not working is not being tracked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Star } from '../../icons';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import {
  Banner,
  BlockerList,
  ErrorNotice,
  Loading,
  PrimaryButton,
} from '../../components/console';
import { InstallApp } from '../../components/InstallApp';
import {
  agoLabel,
  diffJobs,
  fetchMyJobs,
  fetchMyProfile,
  mapsUrl,
  NEXT_STATUS,
  setMyJobStatus,
  setMyState,
  STATUS_STYLE,
  whenLabel,
  type Driver,
  type Job,
  type JobStatus,
} from '../../driver';
import { formatDate, type DriverProfile } from '../../driverDocs';
import { serviceLabel } from '../../data';
import { useNoIndex } from '../../seo';
import { DriverShell } from './DriverShell';

/** How often to push a new position while on duty. */
const POSITION_INTERVAL_MS = 20_000;
/** How often to re-read jobs, so a new booking appears without a refresh. */
const POLL_MS = 10_000;

const FILTERS = [
  { key: 'mine', label: 'Mine' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const DONE: JobStatus[] = ['complete', 'cancelled'];

interface Alert {
  id: string;
  kind: 'new' | 'cancelled';
  text: string;
}

/**
 * Make the phone say something. A job appearing silently in a list on a phone
 * in a cup holder is a job that gets missed. The chime is synthesised so there
 * is no audio file to fail to load in a blackspot.
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

export function DriverConsolePage() {
  useNoIndex('Driver console');
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('mine');
  const [confirmHandBack, setConfirmHandBack] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'unsupported'>(
    () => ('Notification' in window ? Notification.permission : 'unsupported'),
  );

  const lastSent = useRef(0);
  const previousJobs = useRef<Job[] | null>(null);
  const me = profile?.live ?? null;
  const meId = profile?.id ?? null;
  const working = profile?.status === 'active';

  const load = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      setProfile(p);
      if (p.status !== 'active') return;
      const js = await fetchMyJobs();
      setJobs(js);
      setError(null);

      const { newWaiting, cancelledOnMe } = diffJobs(previousJobs.current, js, p.id);
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
        const who = job.cancelledBy === 'office' ? 'The office' : 'The customer';
        const text = `${who} cancelled job #${job.id} (${job.location}). Stand down.`;
        systemNotify('Job cancelled', text);
        setAlerts((a) => [...a, { id: `cancel-${job.id}`, kind: 'cancelled', text }]);
      }
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    document.title = alerts.length > 0 ? `(${alerts.length}) Driver console` : 'Driver console';
  }, [alerts.length]);

  // Suspended or not yet approved: the account's view of itself is out of
  // date, so bring it up to date on the way to the application page.
  const status = profile?.status;
  useEffect(() => {
    if (status && status !== 'active') void refresh();
  }, [status, refresh]);

  // Registered here rather than site-wide: the offline shell exists for a
  // driver in a signal blackspot, and nobody else needs a worker installed.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an unregistered worker costs offline support, nothing else */
    });
  }, []);

  const updateLive = (live: Driver) => setProfile((p) => (p ? { ...p, live } : p));
  const onDuty = Boolean(me?.available);

  useEffect(() => {
    if (!working || !onDuty || !('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        const now = Date.now();
        if (now - lastSent.current < POSITION_INTERVAL_MS) return;
        lastSent.current = now;
        void setMyState({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          .then((live) => setProfile((p) => (p ? { ...p, live } : p)))
          .catch(() => {
            /* a dropped position is not worth interrupting the driver over */
          });
      },
      () => setGeoError('Location is off. Turn it on so customers get a real ETA.'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [working, onDuty]);

  if (profile && profile.status !== 'active') return <Navigate to="/driver/application" replace />;
  if (!profile || !me) {
    return <DriverShell>{error ? <ErrorNotice error={error} /> : <Loading />}</DriverShell>;
  }

  const c = profile.compliance;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleDuty = () =>
    run(async () => {
      updateLive(await setMyState({ available: !me.available }));
      lastSent.current = 0; // send a position straight away on coming on duty
    });

  // The driver can see the recovery and knows whether it is ten more minutes
  // or an hour. Every waiting customer's quoted wait is built on this number.
  const nudgeBusy = (delta: number) =>
    run(async () => {
      const next = Math.max(0, Math.min(480, me.busyMinutes + delta));
      updateLive(await setMyState({ busyMinutes: next }));
    });

  const advance = (job: Job) =>
    run(async () => {
      const step = NEXT_STATUS[job.status];
      if (!step) return;
      try {
        await setMyJobStatus(job.id, step.next as Exclude<JobStatus, 'cancelled'>);
      } finally {
        await load();
      }
    });

  const handBack = (job: Job) =>
    run(async () => {
      setConfirmHandBack(null);
      try {
        await setMyJobStatus(job.id, 'pending');
      } finally {
        await load();
      }
    });

  const askNotifications = async () => {
    if (!('Notification' in window)) return;
    setNotifyPermission(await Notification.requestPermission());
  };

  const expiring = c.items.filter((i) => i.state === 'expiring');
  const motorwayOnly = c.motorwayBlockers.filter((b) => !c.workBlockers.includes(b));

  const counts: Record<FilterKey, number> = {
    mine: jobs.filter((j) => j.driverId === meId && !DONE.includes(j.status)).length,
    waiting: jobs.filter((j) => j.status === 'pending' && j.driverId === null).length,
    done: jobs.filter((j) => j.driverId === meId && DONE.includes(j.status)).length,
  };

  const visible = jobs.filter((j) => {
    if (filter === 'mine') return j.driverId === meId && !DONE.includes(j.status);
    if (filter === 'waiting') return j.status === 'pending' && j.driverId === null;
    return j.driverId === meId && DONE.includes(j.status);
  });

  return (
    <DriverShell>
      <ErrorNotice error={error} />

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

      {c.workBlockers.length > 0 && (
        <Banner
          tone="danger"
          title="You can't go on duty"
          actions={<PrimaryButton to="/driver/documents">Sort my documents</PrimaryButton>}
        >
          <BlockerList items={c.workBlockers} />
        </Banner>
      )}
      {expiring.length > 0 && (
        <Banner
          tone="warn"
          title="Renew soon"
          actions={<PrimaryButton to="/driver/documents">Upload new copies</PrimaryButton>}
        >
          <BlockerList
            items={expiring.map((i) => `${i.label} runs out on ${formatDate(i.validUntil)}.`)}
          />
        </Banner>
      )}
      {profile.motorwayWork && c.workBlockers.length === 0 && motorwayOnly.length > 0 && (
        <Banner tone="info" title="Motorway jobs are off for now">
          <BlockerList items={motorwayOnly} />
        </Banner>
      )}

      <InstallApp />

      {notifyPermission === 'default' && (
        <button
          type="button"
          onClick={() => void askNotifications()}
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
        className={`border-2 p-5 ${me.available ? 'border-yellow-400 bg-yellow-400/10' : 'border-neutral-800 bg-neutral-900'}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-display text-2xl uppercase leading-none">
              {me.available ? 'On duty' : 'Off duty'}
            </div>
            <p className="text-xs text-neutral-400 font-medium mt-1.5">
              {me.available
                ? `Sharing location · ${agoLabel(me.locatedAt)}`
                : 'Not taking jobs. Location is not shared.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleDuty()}
            disabled={busy || (!me.available && !c.canWork)}
            aria-pressed={me.available}
            className={`shrink-0 px-5 py-3.5 font-display uppercase tracking-wider border-2 disabled:opacity-40 ${
              me.available
                ? 'bg-neutral-950 text-white border-neutral-700'
                : 'bg-yellow-400 text-neutral-950 border-yellow-400'
            }`}
          >
            {me.available ? 'Go off' : 'Go on'}
          </button>
        </div>
        {geoError && me.available && (
          <p className="text-[var(--color-danger-soft)] text-xs font-bold mt-3">{geoError}</p>
        )}
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
                : 'Nothing finished yet.'}
          </p>
        ) : (
          visible.map((job) => {
            const mine = job.driverId === meId;
            const takeBlocked = !mine
              ? !c.canWork
                ? 'Sort your documents to take jobs.'
                : job.motorway && !c.canMotorway
                  ? 'Motorway jobs need an approved NHSS 17 card.'
                  : null
              : null;
            return (
              <JobCard
                key={job.id}
                job={job}
                mine={mine}
                busy={busy}
                takeBlocked={takeBlocked}
                confirmingHandBack={confirmHandBack === job.id}
                onAdvance={() => void advance(job)}
                onAskHandBack={() => setConfirmHandBack(job.id)}
                onCancelHandBack={() => setConfirmHandBack(null)}
                onHandBack={() => void handBack(job)}
              />
            );
          })
        )}
      </div>
    </DriverShell>
  );
}

function JobCard({
  job,
  mine,
  busy,
  takeBlocked,
  confirmingHandBack,
  onAdvance,
  onAskHandBack,
  onCancelHandBack,
  onHandBack,
}: {
  job: Job;
  mine: boolean;
  busy: boolean;
  takeBlocked: string | null;
  confirmingHandBack: boolean;
  onAdvance: () => void;
  onAskHandBack: () => void;
  onCancelHandBack: () => void;
  onHandBack: () => void;
}) {
  const step = NEXT_STATUS[job.status];
  const style = STATUS_STYLE[job.status];
  const finished = job.status === 'complete' || job.status === 'cancelled';
  const canHandBack = mine && (job.status === 'accepted' || job.status === 'en_route');

  return (
    <article className={`border-2 ${style.border} bg-neutral-900 ${finished ? 'opacity-60' : ''}`}>
      {job.motorway && !finished && (
        <p className="bg-[var(--color-danger)] text-white text-[11px] font-black uppercase tracking-wider px-4 py-2">
          ⚠ Motorway · live carriageway procedure
        </p>
      )}
      {job.status === 'cancelled' && (
        <p className="bg-neutral-800 text-neutral-300 text-[11px] font-black uppercase tracking-wider px-4 py-2">
          {job.cancelledBy === 'customer' ? 'Cancelled by the customer' : 'Cancelled by the office'}
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
          <dd className={`font-bold ${job.timing === 'later' && !finished ? 'text-yellow-400' : ''}`}>
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
            {job.phone ? (
              <a
                href={`tel:${job.phone.replace(/[^\d+]/g, '')}`}
                className="text-yellow-400 underline font-medium"
              >
                {job.phone}
              </a>
            ) : (
              <span className="text-neutral-500">Shown once you take the job</span>
            )}
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

        {takeBlocked && job.status === 'pending' && (
          <p className="text-[12px] font-bold text-yellow-400">{takeBlocked}</p>
        )}

        {confirmingHandBack ? (
          <div className="flex gap-2 items-center">
            <span className="text-[12px] font-bold text-neutral-300 flex-1">
              Hand #{job.id} back for another driver?
            </span>
            <button
              type="button"
              onClick={onCancelHandBack}
              className="px-4 py-2.5 bg-neutral-800 text-white font-display uppercase tracking-wider text-xs"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onHandBack}
              disabled={busy}
              className="px-4 py-2.5 bg-[var(--color-danger)] text-white font-display uppercase tracking-wider text-xs disabled:opacity-50"
            >
              Hand back
            </button>
          </div>
        ) : (
          !finished && (
            <div className="flex gap-2">
              <a
                href={mapsUrl(job)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center bg-neutral-800 text-white font-display py-3 uppercase tracking-wider text-sm"
              >
                Navigate
              </a>
              {step && (mine || job.status === 'pending') && (
                <button
                  type="button"
                  onClick={onAdvance}
                  disabled={busy || Boolean(takeBlocked)}
                  className="flex-1 bg-yellow-400 text-neutral-950 font-display py-3 uppercase tracking-wider text-sm disabled:opacity-40"
                >
                  {step.label}
                </button>
              )}
              {canHandBack && (
                <button
                  type="button"
                  onClick={onAskHandBack}
                  className="px-3 py-3 border-2 border-neutral-800 text-neutral-400 hover:text-white font-display uppercase tracking-wider text-xs"
                >
                  Hand back
                </button>
              )}
            </div>
          )
        )}
      </div>
    </article>
  );
}
