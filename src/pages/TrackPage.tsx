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
import { CardPayment } from '../components/CardPayment';
import { choosePaymentMethod, formatPounds, syncCardPayment } from '../payments';
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

  // Back from a card check that needed its own page: ask Stripe how it went.
  useEffect(() => {
    if (!token || !new URLSearchParams(window.location.search).has('payment_intent')) return;
    void syncCardPayment(token)
      .then(() => load())
      .catch(() => undefined);
  }, [token, load]);

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
    <div className="min-h-screen bg-white text-slate-950 font-sans">
      <div className="hazard-stripes h-2" aria-hidden="true" />
      <header className="border-b-2 border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <Logo className="w-9 h-9 shrink-0" />
          <Wordmark className="text-lg text-slate-950 whitespace-nowrap" />
        </Link>
        <a
          href={`tel:${PHONE_TEL}`}
          data-call="track-header"
          className="shrink-0 bg-accent-400 text-neutral-950 font-display px-4 py-2 uppercase tracking-wider text-sm inline-flex items-center gap-2"
        >
          <PhoneCall className="w-4 h-4" /> Call
        </a>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
        {notFound ? (
          <section className="border border-slate-200 bg-slate-50 p-6 text-center">
            <h1 className="font-display text-2xl uppercase tracking-tight">Booking not found</h1>
            <p className="text-slate-500 text-sm mt-2">
              That link does not match a booking. If you are waiting for recovery, ring us and we
              will find you.
            </p>
            <a
              href={`tel:${PHONE_TEL}`}
              data-call="track-not-found"
              className="mt-5 inline-flex items-center gap-2 bg-accent-400 text-neutral-950 font-display px-6 py-3 uppercase tracking-wider"
            >
              <PhoneCall className="w-5 h-5" /> {PHONE_DISPLAY}
            </a>
          </section>
        ) : !info ? (
          <p className="text-slate-500 text-sm flex items-center gap-2 py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />{' '}
            {offline ? 'Reconnecting…' : 'Loading your booking…'}
          </p>
        ) : (
          <>
            {offline && (
              <p className="border border-slate-300 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                No connection. Showing the last update.
              </p>
            )}

            {info.motorway && info.status !== 'complete' && info.status !== 'cancelled' && (
              <div
                role="alert"
                className="border border-accent-400 bg-accent-50 px-4 py-3 text-[12px] leading-relaxed"
              >
                <div className="flex items-center gap-2 text-slate-950 font-black text-[11px] uppercase tracking-[0.15em] mb-1">
                  <AlertTriangle className="w-4 h-4" /> Motorway
                </div>
                <strong>Stay behind the barrier</strong>, away from the car, until the driver is
                with you. In immediate danger call 999.
              </div>
            )}

            <StatusCard info={info} />

            <PaymentPanel info={info} token={token} onChange={() => void load()} />

            {info.pickupLat !== null && info.pickupLng !== null && (
              <Suspense
                fallback={
                  <div className="h-64 sm:h-80 w-full bg-slate-50 border border-slate-200" />
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
              <section className="border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
                {info.driver.hasPhoto && (
                  <img
                    src={driverPhotoUrl(token)}
                    alt={`Photo of ${firstName(info.driver.name)}`}
                    className="w-16 h-16 object-cover border border-slate-300 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Your driver
                  </div>
                  <div className="font-display text-xl uppercase tracking-tight truncate">
                    {info.driver.name}
                  </div>
                  {(info.driver.vehicleReg || info.driver.vehicleDescription) && (
                    <div className="text-[12px] text-slate-600 font-medium">
                      Look for{' '}
                      {info.driver.vehicleDescription
                        ? `a ${info.driver.vehicleDescription}`
                        : 'the truck'}
                      {info.driver.vehicleReg && (
                        <>
                          {' '}
                          <span className="inline-block bg-accent-400 text-neutral-950 font-display px-1.5 tracking-wider">
                            {formatReg(info.driver.vehicleReg)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {info.driver.locatedAt && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      Position updated {agoLabel(info.driver.locatedAt)}
                    </div>
                  )}
                </div>
                {info.driver.phone && info.status !== 'complete' && (
                  <a
                    href={`tel:${info.driver.phone.replace(/[^\d+]/g, '')}`}
                    className="shrink-0 border-2 border-accent-400 text-slate-950 font-display px-4 py-2.5 uppercase tracking-wider text-sm inline-flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Ring {firstName(info.driver.name)}
                  </a>
                )}
              </section>
            )}

            <Details info={info} />

            {info.status === 'complete' && (
              <section className="border border-accent-400 bg-accent-50 p-4">
                {info.rating !== null || thanked ? (
                  <p className="text-sm font-bold flex items-center gap-2">
                    <Check className="w-5 h-5 text-slate-950" /> Thanks. You rated this job{' '}
                    {info.rating}/5.
                  </p>
                ) : (
                  <>
                    <h2 className="font-display text-lg uppercase tracking-tight">
                      How did we do?
                    </h2>
                    <p className="text-[12px] text-slate-600 mt-1">
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
                            className={`w-8 h-8 ${n <= stars ? 'text-slate-950 fill-accent-400' : 'text-slate-400'}`}
                          />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value.slice(0, 500))}
                      placeholder="Anything to add? (optional)"
                      rows={2}
                      className="mt-3 w-full bg-white border-2 border-slate-200 focus:border-accent-400 outline-none px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={rate}
                      disabled={busy || stars === 0}
                      className="mt-3 w-full bg-accent-400 text-neutral-950 font-display py-3 uppercase tracking-wider disabled:opacity-50"
                    >
                      Send rating
                    </button>
                  </>
                )}
              </section>
            )}

            {info.canCancel && (
              <section className="border border-slate-200 bg-slate-50 p-4">
                {confirmCancel ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-bold">
                      Cancel this booking? {info.driver ? 'The driver will be told.' : ''}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="flex-1 bg-slate-100 text-slate-950 font-display py-3 uppercase tracking-wider text-sm"
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={busy}
                        className="flex-1 bg-[var(--color-danger)] text-slate-950 font-display py-3 uppercase tracking-wider text-sm disabled:opacity-50"
                      >
                        Yes, cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="w-full text-slate-500 hover:text-[var(--color-danger)] font-bold text-[12px] uppercase tracking-wider py-1"
                  >
                    Don't need us any more? Cancel booking
                  </button>
                )}
              </section>
            )}

            {actionError && (
              <p
                role="alert"
                className="text-[var(--color-danger)] text-xs font-bold uppercase tracking-wider text-center"
              >
                {actionError}
              </p>
            )}

            <p className="text-center text-[11px] text-slate-500 mt-2">
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
      className={`border p-5 ${cancelled ? 'border-slate-300 bg-slate-50' : 'border-accent-400 bg-slate-50'}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        Booking #{info.id}
      </div>
      <h1 className="font-display text-3xl uppercase tracking-tight mt-1 leading-none">
        {headlineFor(info)}
      </h1>
      <p className="text-slate-600 text-sm mt-2">{subtitleFor(info)}</p>

      {showEta && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
            {info.status === 'pending' ? 'Typical wait' : 'Arriving in'}
          </span>
          <span className="font-display text-4xl text-slate-950">
            {info.status === 'pending' ? '~' : ''}
            {info.etaMinutes}
          </span>
          <span className="text-slate-500 font-bold text-sm">min</span>
          {info.etaSource === 'driver' && (
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">
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
                  className={`h-1.5 w-full ${done || current ? 'bg-accent-400' : 'bg-slate-100'} ${current && info.status !== 'complete' ? 'animate-pulse' : ''}`}
                  aria-hidden="true"
                />
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${done || current ? 'text-slate-950' : 'text-slate-400'}`}
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
    <section className="border border-slate-200 bg-slate-50 p-4">
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500 text-[11px] font-bold uppercase tracking-wider pt-0.5">
              {label}
            </dt>
            <dd
              className={`break-words ${label === 'Price' ? 'font-display text-slate-950 text-lg' : ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** How this booking is being paid, and adding a card when that's the plan. */
function PaymentPanel({
  info,
  token,
  onChange,
}: {
  info: TrackInfo;
  token: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (info.price === null) return null;

  const amount = `£${info.price}`;
  const open = info.status !== 'cancelled' && info.status !== 'complete';

  const switchTo = async (method: 'card' | 'cash') => {
    setBusy(true);
    setError(null);
    try {
      await choosePaymentMethod(token, method);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be changed. Please ring us.');
    } finally {
      setBusy(false);
    }
  };

  const line = (text: string) => (
    <section className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      {text}
    </section>
  );

  if (info.paymentMethod === 'card') {
    if (info.paymentStatus === 'paid') return line(`Paid ${amount} by card. Thank you.`);
    if (info.paymentStatus === 'refunded') return line('Your card payment was refunded.');
    if (info.paymentStatus === 'partly_refunded')
      return line('Part of your card payment was refunded.');
    if (info.status === 'cancelled')
      return line('Your booking was cancelled, so nothing was taken from your card.');
    if (info.paymentStatus === 'authorised') {
      return line(`${amount} is held on your card. It's only taken when the job is done.`);
    }
    return (
      <section className="border border-accent-400 bg-slate-50 p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight">
            {info.paymentStatus === 'failed'
              ? 'Your card payment didn’t go through'
              : 'Add your card'}
          </h2>
          <p className="text-[12px] text-slate-500 mt-1">
            {info.paymentStatus === 'failed'
              ? 'Try again with another card, or pay your driver on the day.'
              : `We hold ${amount} now and only take it when the job is done.`}
          </p>
        </div>
        <CardPayment token={token} onSettled={() => onChange()} />
        {open && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void switchTo('cash')}
            className="self-start text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-950 underline disabled:opacity-50"
          >
            Pay cash instead
          </button>
        )}
        {error && (
          <p role="alert" className="text-[var(--color-danger)] text-xs font-bold">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (info.paymentStatus === 'paid_in_person') return line('Paid to your driver. Thank you.');

  // Cash with a deposit: the platform's cut on the card, the rest to the driver.
  const deposit = info.depositPence ?? null;
  if (deposit) {
    const depositLabel = formatPounds(deposit);
    const toDriver = formatPounds(info.price * 100 - deposit);
    if (info.paymentStatus === 'deposit_paid')
      return line(`${depositLabel} deposit taken and the rest paid to your driver. Thank you.`);
    if (info.paymentStatus === 'refunded') return line('Your deposit was refunded.');
    if (info.paymentStatus === 'partly_refunded') return line('Part of your deposit was refunded.');
    if (info.status === 'cancelled')
      return line('Your booking was cancelled, so nothing was taken from your card.');
    if (!open) return null;
    if (info.paymentStatus === 'authorised')
      return line(
        `Your ${depositLabel} deposit is held on your card and taken when the job is done. Pay your driver ${toDriver} in cash.`,
      );
    return (
      <section className="border border-accent-400 bg-slate-50 p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight">
            {info.paymentStatus === 'failed'
              ? 'Your deposit didn’t go through'
              : `Pay your ${depositLabel} deposit`}
          </h2>
          <p className="text-[12px] text-slate-500 mt-1">
            {info.paymentStatus === 'failed'
              ? `Try another card, or pay your driver the full ${amount} in cash on the day.`
              : `It secures your booking and is only held until the job is done. Then pay your driver ${toDriver} in cash.`}
          </p>
        </div>
        <CardPayment token={token} onSettled={() => onChange()} />
        {info.cardAvailable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void switchTo('card')}
            className="self-start text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-950 underline disabled:opacity-50"
          >
            Pay the full {amount} by card instead
          </button>
        )}
        {error && (
          <p role="alert" className="text-[var(--color-danger)] text-xs font-bold">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (!open) return null;
  return (
    <section className="border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-700">Pay your driver {amount} on the day.</p>
      {info.cardAvailable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void switchTo('card')}
          className="text-[12px] font-bold uppercase tracking-wider text-slate-950 underline disabled:opacity-50"
        >
          Pay by card instead
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-[var(--color-danger)] text-xs font-bold">
          {error}
        </p>
      )}
    </section>
  );
}
