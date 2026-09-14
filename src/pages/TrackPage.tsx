// "Where's my driver?" — the customer's live page for one booking.
//
// Reached from the confirmation screen (or a link the operator texts them),
// keyed by the booking's own unguessable token. Polls the API so the status,
// the ETA and, once the truck sets off, its position on the map all move
// without a refresh. Never indexed: it is somebody's pickup address.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Phone, PhoneCall, Star, Check } from '../icons';
import { Logo } from '../components/Logo';
import { Wordmark } from '../components/Layout';
import { PHONE_TEL, PHONE_DISPLAY } from '../config';
import { serviceLabel } from '../data';
import { whenLabel } from '../driver';
import { useNoIndex } from '../seo';
import { track } from '../telemetry';
import {
  TRACK_STEPS,
  TrackError,
  agoLabel,
  cancelTrack,
  driverPhotoUrl,
  fetchTrack,
  firstName,
  formatReg,
  headlineFor,
  rateTrack,
  stepIndex,
  type TrackInfo,
} from '../track';

const TrackMap = lazy(() => import('../components/TrackMap'));

/** How often to ask again. Faster while the truck is actually moving. */
const POLL_IDLE_MS = 12_000;
const POLL_MOVING_MS = 6_000;

export function TrackPage() {
  const { token = '' } = useParams();
  useNoIndex('Track your driver');

  const [info, setInfo] = useState<TrackInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [thanked, setThanked] = useState(false);
  const statusRef = useRef<TrackInfo['status'] | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchTrack(token, signal);
        setInfo(next);
        setOffline(false);
        statusRef.current = next.status;
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof TrackError && err.status === 404) setNotFound(true);
        else setOffline(true);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const moving = statusRef.current === 'en_route';
      timer = setTimeout(
        async () => {
          if (controller.signal.aborted) return;
          await load(controller.signal);
          const finished = statusRef.current === 'complete' || statusRef.current === 'cancelled';
          if (!finished) schedule();
        },
        moving ? POLL_MOVING_MS : POLL_IDLE_MS,
      );
    };
    schedule();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [token, load]);

  // A tab that was in the background for a while wakes up with stale data.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  // Counted once per visit, with where the job had got to when they looked.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!info || viewedRef.current) return;
    viewedRef.current = true;
    track('track_viewed', { status: info.status });
  }, [info]);

  const cancel = async () => {
    setBusy(true);
    setActionError(null);
    try {
      setInfo(await cancelTrack(token));
      setConfirmCancel(false);
      track('track_cancelled');
    } catch (err) {
      setActionError(
        err instanceof TrackError && err.status === 409
          ? 'Too late to cancel online. Please ring us.'
          : 'Could not cancel just now. Please ring us.',
      );
    } finally {
      setBusy(false);
    }
  };

  const rate = async () => {
    if (stars === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      setInfo(await rateTrack(token, stars, comment));
      setThanked(true);
      track('track_rated', { stars });
    } catch {
      setActionError('Could not send your rating. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans">
      <div className="hazard-stripes h-2" aria-hidden="true" />
      <header className="border-b-2 border-neutral-800 px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <Logo className="w-9 h-9 shrink-0" />
          <Wordmark className="text-lg text-white whitespace-nowrap" />
        </Link>
        <a
          href={`tel:${PHONE_TEL}`}
          data-call="track-header"
          className="shrink-0 bg-yellow-400 text-neutral-950 font-display px-4 py-2 uppercase tracking-wider text-sm inline-flex items-center gap-2"
        >
          <PhoneCall className="w-4 h-4" /> Call
        </a>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
        {notFound ? (
          <section className="border-2 border-neutral-800 bg-neutral-900 p-6 text-center">
            <h1 className="font-display text-2xl uppercase tracking-tight">Booking not found</h1>
            <p className="text-neutral-400 text-sm mt-2">
              That link does not match a booking. If you are waiting for recovery, ring us and we
              will find you.
            </p>
            <a
              href={`tel:${PHONE_TEL}`}
              data-call="track-not-found"
              className="mt-5 inline-flex items-center gap-2 bg-yellow-400 text-neutral-950 font-display px-6 py-3 uppercase tracking-wider"
            >
              <PhoneCall className="w-5 h-5" /> {PHONE_DISPLAY}
            </a>
          </section>
        ) : !info ? (
          <p className="text-neutral-400 text-sm flex items-center gap-2 py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />{' '}
            {offline ? 'Reconnecting…' : 'Loading your booking…'}
          </p>
        ) : (
          <>
            {offline && (
              <p className="border-2 border-neutral-700 bg-neutral-900 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                No connection. Showing the last update.
              </p>
            )}

            {info.motorway && info.status !== 'complete' && info.status !== 'cancelled' && (
              <div
                role="alert"
                className="border-2 border-yellow-400 bg-yellow-400/10 px-4 py-3 text-[12px] leading-relaxed"
              >
                <div className="flex items-center gap-2 text-yellow-400 font-black text-[11px] uppercase tracking-[0.15em] mb-1">
                  <AlertTriangle className="w-4 h-4" /> Motorway
                </div>
                <strong>Stay behind the barrier</strong>, away from the car, until the driver is
                with you. In immediate danger call 999.
              </div>
            )}

            <StatusCard info={info} />

            {info.pickupLat !== null && info.pickupLng !== null && (
              <Suspense
                fallback={
                  <div className="h-64 sm:h-80 w-full bg-neutral-900 border-2 border-neutral-800" />
                }
              >
                <TrackMap
                  pickup={{ lat: info.pickupLat, lng: info.pickupLng }}
                  driver={
                    info.driver && info.driver.lat !== null && info.driver.lng !== null
                      ? { lat: info.driver.lat, lng: info.driver.lng }
                      : null
                  }
                />
              </Suspense>
            )}

            {info.driver && info.status !== 'cancelled' && (
              <section className="border-2 border-neutral-800 bg-neutral-900 p-4 flex items-center justify-between gap-3">
                {info.driver.hasPhoto && (
                  <img
                    src={driverPhotoUrl(token)}
                    alt={`Photo of ${firstName(info.driver.name)}`}
                    className="w-16 h-16 object-cover border-2 border-neutral-700 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                    Your driver
                  </div>
                  <div className="font-display text-xl uppercase tracking-tight truncate">
                    {info.driver.name}
                  </div>
                  {(info.driver.vehicleReg || info.driver.vehicleDescription) && (
                    <div className="text-[12px] text-neutral-300 font-medium">
                      Look for{' '}
                      {info.driver.vehicleDescription ? `a ${info.driver.vehicleDescription}` : 'the truck'}
                      {info.driver.vehicleReg && (
                        <>
                          {' '}
                          <span className="inline-block bg-yellow-400 text-neutral-950 font-display px-1.5 tracking-wider">
                            {formatReg(info.driver.vehicleReg)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {info.driver.locatedAt && (
                    <div className="text-[11px] text-neutral-400 font-medium">
                      Position updated {agoLabel(info.driver.locatedAt)}
                    </div>
                  )}
                </div>
                {info.driver.phone && info.status !== 'complete' && (
                  <a
                    href={`tel:${info.driver.phone.replace(/[^\d+]/g, '')}`}
                    className="shrink-0 border-2 border-yellow-400 text-yellow-400 font-display px-4 py-2.5 uppercase tracking-wider text-sm inline-flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Ring {firstName(info.driver.name)}
                  </a>
                )}
              </section>
            )}

            <Details info={info} />

            {info.status === 'complete' && (
              <section className="border-2 border-yellow-400 bg-yellow-400/10 p-4">
                {info.rating !== null || thanked ? (
                  <p className="text-sm font-bold flex items-center gap-2">
                    <Check className="w-5 h-5 text-yellow-400" /> Thanks. You rated this job{' '}
                    {info.rating}/5.
                  </p>
                ) : (
                  <>
                    <h2 className="font-display text-lg uppercase tracking-tight">
                      How did we do?
                    </h2>
                    <p className="text-[12px] text-neutral-300 mt-1">
                      Your rating goes straight to the operator and the driver.
                    </p>
                    <div className="flex gap-1.5 mt-3" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={stars === n}
                          aria-label={`${n} star${n === 1 ? '' : 's'}`}
                          onClick={() => setStars(n)}
                          className="p-1"
                        >
                          <Star
                            className={`w-8 h-8 ${n <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-neutral-600'}`}
                          />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value.slice(0, 500))}
                      placeholder="Anything to add? (optional)"
                      rows={2}
                      className="mt-3 w-full bg-neutral-950 border-2 border-neutral-800 focus:border-yellow-400 outline-none px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={rate}
                      disabled={busy || stars === 0}
                      className="mt-3 w-full bg-yellow-400 text-neutral-950 font-display py-3 uppercase tracking-wider disabled:opacity-50"
                    >
                      Send rating
                    </button>
                  </>
                )}
              </section>
            )}

            {info.canCancel && (
              <section className="border-2 border-neutral-800 bg-neutral-900 p-4">
                {confirmCancel ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-bold">
                      Cancel this booking? {info.driver ? 'The driver will be told.' : ''}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="flex-1 bg-neutral-800 text-white font-display py-3 uppercase tracking-wider text-sm"
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={busy}
                        className="flex-1 bg-[var(--color-danger)] text-white font-display py-3 uppercase tracking-wider text-sm disabled:opacity-50"
                      >
                        Yes, cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="w-full text-neutral-400 hover:text-[var(--color-danger-soft)] font-bold text-[12px] uppercase tracking-wider py-1"
                  >
                    Don't need us any more? Cancel booking
                  </button>
                )}
              </section>
            )}

            {actionError && (
              <p
                role="alert"
                className="text-[var(--color-danger-soft)] text-xs font-bold uppercase tracking-wider text-center"
              >
                {actionError}
              </p>
            )}

            <p className="text-center text-[11px] text-neutral-500 mt-2">
              Keep this page open. It updates itself. Something wrong?{' '}
              <a href={`tel:${PHONE_TEL}`} data-call="track-footer" className="underline">
                Ring {PHONE_DISPLAY}
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function StatusCard({ info }: { info: TrackInfo }) {
  const cancelled = info.status === 'cancelled';
  const index = stepIndex(info.status);
  const showEta =
    !cancelled &&
    info.timing === 'now' &&
    info.etaMinutes !== null &&
    (info.status === 'pending' || info.status === 'accepted' || info.status === 'en_route');

  return (
    <section
      className={`border-2 p-5 ${cancelled ? 'border-neutral-700 bg-neutral-900' : 'border-yellow-400 bg-neutral-900'}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
        Booking #{info.id}
      </div>
      <h1 className="font-display text-3xl uppercase tracking-tight mt-1 leading-none">
        {headlineFor(info)}
      </h1>
      <p className="text-neutral-300 text-sm mt-2">{subtitleFor(info)}</p>

      {showEta && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
            {info.status === 'pending' ? 'Typical wait' : 'Arriving in'}
          </span>
          <span className="font-display text-4xl text-yellow-400">
            {info.status === 'pending' ? '~' : ''}
            {info.etaMinutes}
          </span>
          <span className="text-neutral-500 font-bold text-sm">min</span>
          {info.etaSource === 'driver' && (
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider ml-1">
              measured
            </span>
          )}
        </div>
      )}

      {!cancelled && (
        <ol className="mt-5 grid grid-cols-5 gap-1" aria-label="Progress">
          {TRACK_STEPS.map((step, i) => {
            const done = i < index;
            const current = i === index;
            return (
              <li key={step.status} className="flex flex-col gap-1.5">
                <span
                  className={`h-1.5 w-full ${done || current ? 'bg-yellow-400' : 'bg-neutral-800'} ${current && info.status !== 'complete' ? 'animate-pulse' : ''}`}
                  aria-hidden="true"
                />
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${done || current ? 'text-white' : 'text-neutral-600'}`}
                  aria-current={current ? 'step' : undefined}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function subtitleFor(info: TrackInfo): string {
  switch (info.status) {
    case 'pending':
      if (info.timing === 'later')
        return `Booked for ${whenLabel(info)}. A driver will pick it up nearer the time.`;
      return info.driversOnDuty > 0
        ? 'A driver on duty has been alerted. This updates the moment one takes your job.'
        : 'Nobody is on duty this second. We have your details and will ring you shortly.';
    case 'accepted':
      return 'Your driver has your details and is getting ready to set off.';
    case 'en_route':
      return 'Stay with the car if it is safe to, or behind the barrier if not. The map updates as they get closer.';
    case 'on_scene':
      return 'Your driver has arrived. Say hello.';
    case 'complete':
      return 'Thanks for booking with us. Safe travels.';
    case 'cancelled':
      return info.cancelledBy === 'customer'
        ? 'You cancelled this booking. Nothing to pay. Book again any time.'
        : 'Sorry, we could not complete this booking. Ring us and we will sort it out.';
  }
}

function Details({ info }: { info: TrackInfo }) {
  const rows: [string, string][] = [
    ['Service', serviceLabel(info.service)],
    ['When', whenLabel(info)],
    ['Pickup', info.location],
  ];
  if (info.destination) rows.push(['Drop-off', info.destination]);
  if (info.vehicle) rows.push(['Vehicle', info.vehicle]);
  rows.push(['Price', info.price !== null ? `£${info.price}` : 'Confirmed by phone']);

  return (
    <section className="border-2 border-neutral-800 bg-neutral-900 p-4">
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500 text-[11px] font-bold uppercase tracking-wider pt-0.5">
              {label}
            </dt>
            <dd
              className={`break-words ${label === 'Price' ? 'font-display text-yellow-400 text-lg' : ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
