import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Flatpickr from 'react-flatpickr';
import {
  MapPin,
  Phone,
  Crosshair,
  Loader2,
  ArrowRight,
  Wrench,
  ChevronDown,
  Navigation,
  ChevronLeft,
  CheckCheck,
  PhoneCall,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Car,
  Copy,
  Check,
} from '../icons';
import { PHONE_TEL, PHONE_DISPLAY, SITE_URL, trackPath } from '../config';
import { SERVICE_OPTIONS, serviceNeedsDestination } from '../data';
import { CountUp } from './motion';
import { useMetrics } from '../metrics';
import { useSubmitBooking } from '../useBackend';
import { validateQuote, VEHICLE_MAX_LENGTH, type QuoteData } from '../validation';
import {
  detectMotorway,
  detectMotorwayAt,
  estimateJourney,
  resolveLocation,
  type JourneyEstimate,
  type LatLng,
} from '../route';
import { PlaceInput } from './PlaceInput';
import { fetchEta, type EtaQuote } from '../eta';
import { track } from '../telemetry';
import { formatPhone } from '../phone';
import {
  estimatePrice,
  isNightHour,
  formatPrice,
  FROM_PRICE,
  MOTORWAY_SURCHARGE,
} from '../pricing';

const defaultScheduledDate = (): Date => {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(9, 0, 0, 0);
  return t;
};

const formatScheduledFor = (d: Date | null): string =>
  d
    ? d.toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

/** How often to re-ask what the wait is, so availability stays current. */
const ETA_POLL_MS = 15_000;
/**
 * Pause after the last keystroke before geocoding a typed pickup for the live
 * wait. Without this every keystroke was a Nominatim request, which their
 * usage policy forbids and enforces with an IP ban.
 */
const ETA_DEBOUNCE_MS = 900;

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
};

/** The "voila" — a single confident price that pops in and counts up. */
function PriceReveal({
  price,
  estimate,
  night,
}: {
  price: number;
  estimate: JourneyEstimate | null;
  night: boolean;
}) {
  return (
    <motion.div
      key={price}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 17 }}
      className="flex items-center justify-between gap-3"
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-red-500 font-black">
          Your price{night ? ' · night rate' : ''}
        </div>
        <div className="text-[11px] text-neutral-400 font-medium mt-0.5">
          {estimate && estimate.loadedMiles > 0 ? (
            <>
              {estimate.loadedMiles} mi · ~{estimate.loadedMinutes} min tow
            </>
          ) : (
            <>Roadside fix · no tow needed</>
          )}
        </div>
      </div>
      <div className="font-display text-4xl sm:text-5xl text-yellow-400 leading-none flex items-baseline">
        £<CountUp value={price} />
      </div>
    </motion.div>
  );
}

/** The second tile of the dispatch panel: whichever real figure we have. */
function ActivityStat() {
  const metrics = useMetrics();
  if (!metrics.isLive) {
    return <Stat label="Rescues / Day" value={<CountUp value={metrics.rescuesToday} />} />;
  }
  if (metrics.rescuesToday > 0) {
    return <Stat label="Rescues Today" value={<CountUp value={metrics.rescuesToday} />} />;
  }
  if (metrics.driversAvailable > 0) {
    return <Stat label="On Duty Now" value={<CountUp value={metrics.driversAvailable} />} />;
  }
  return <Stat label="Dispatch" value="24/7" />;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 sm:py-5">
      <div className="text-[10px] sm:text-xs text-red-500 font-black mb-0.5 sm:mb-1 uppercase tracking-[0.2em]">
        {label}
      </div>
      <div className="font-display text-2xl sm:text-4xl text-white">{value}</div>
    </div>
  );
}

/** "Copy link" that says it did. */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible on screen anyway */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Link copied' : 'Copy tracking link'}
    </button>
  );
}

export function BookingForm({
  regionName,
  defaultService = '',
}: {
  regionName: string;
  defaultService?: string;
}) {
  const metrics = useMetrics();
  const submitBooking = useSubmitBooking();

  const [quoteData, setQuoteData] = useState<QuoteData>({
    location: '',
    destination: '',
    phone: '',
    service: defaultService,
    vehicle: '',
    timing: 'now',
    scheduledFor: defaultScheduledDate(),
  });
  const [isLocating, setIsLocating] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedEta, setConfirmedEta] = useState<number | null>(null);
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null);
  // The key to the tracking page. Absent when the booking was queued offline.
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);
  // Whether the ETA came from a real driver's position. Decides whether the
  // confirmation may claim a dispatch at all.
  const [driverAssigned, setDriverAssigned] = useState(false);

  // Exact coordinates for a place the customer picked from the suggestions.
  // Null whenever they've typed freehand, in which case we fall back to
  // geocoding the text — the same behaviour as before autocomplete existed.
  const [pickupPin, setPickupPin] = useState<LatLng | null>(null);
  const [dropoffPin, setDropoffPin] = useState<LatLng | null>(null);
  // Motorway detected from the coordinates, for the "Find Me" path where the
  // customer never types a road name. The typed text is checked synchronously.
  const [motorwayAtPin, setMotorwayAtPin] = useState<string | null>(null);
  // What the backend says the real wait is, once we know where the customer
  // is. Null until asked, or whenever nobody is on duty to measure from.
  const [liveEta, setLiveEta] = useState<EtaQuote | null>(null);
  const [estimate, setEstimate] = useState<JourneyEstimate | null>(null);
  const [estimateStatus, setEstimateStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );

  const locationRef = useRef<HTMLInputElement>(null);
  const serviceRef = useRef<HTMLSelectElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  // Reset the form whenever the visitor navigates to a different page.
  useEffect(() => {
    setFormStep(1);
    setSubmitError(null);
    setConfirmedEta(null);
    setConfirmedPrice(null);
    setConfirmedToken(null);
    setEstimate(null);
    setEstimateStatus('idle');
    setQuoteData((prev) => ({ ...prev, service: defaultService }));
  }, [regionName, defaultService]);

  // Live driving-distance / tow-time estimate once a pickup and drop-off exist.
  // Debounced, and any in-flight request is aborted when the inputs change.
  const needsDestination = serviceNeedsDestination(quoteData.service);
  const pickup = quoteData.location.trim();
  const dropoff = quoteData.destination.trim();
  // Nothing can be dispatched without knowing what the job is, and a tow
  // needs somewhere to go. The panel above says which is missing. The button
  // is aria-disabled rather than disabled so a screen reader still finds it
  // and hears the reason, rather than it vanishing from the tab order.
  const missingService = !quoteData.service;
  const missingDropoff = needsDestination && !dropoff;
  const cannotDispatch = missingService || missingDropoff;
  useEffect(() => {
    // Runs for roadside jobs too: the truck still drives out to the car, and
    // those miles are chargeable, so a jump start needs a route just as a tow
    // does. Only the drop-off leg is conditional.
    const needsDropoffFirst = needsDestination && dropoff.length < 3;
    if (formStep !== 2 || !quoteData.service || pickup.length < 3 || needsDropoffFirst) {
      setEstimate(null);
      setEstimateStatus('idle');
      return;
    }
    const controller = new AbortController();
    setEstimateStatus('loading');
    const timer = setTimeout(() => {
      estimateJourney(
        pickupPin ?? pickup,
        needsDestination ? (dropoffPin ?? dropoff) : null,
        controller.signal,
      )
        .then((result) => {
          setEstimate(result);
          setEstimateStatus(result ? 'done' : 'error');
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setEstimate(null);
            setEstimateStatus('error');
          }
        });
    }, 700);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [formStep, needsDestination, quoteData.service, pickup, dropoff, pickupPin, dropoffPin]);

  useEffect(() => {
    if (!pickupPin || detectMotorway(quoteData.location)) {
      setMotorwayAtPin(null);
      return;
    }
    const controller = new AbortController();
    void detectMotorwayAt(pickupPin, controller.signal).then((found) => {
      if (!controller.signal.aborted) setMotorwayAtPin(found);
    });
    return () => controller.abort();
  }, [pickupPin, quoteData.location]);

  // A real wait, measured from where the nearest free driver actually is.
  //
  // Resolves the pickup itself when the customer typed an address rather than
  // picking one from the list — which is most of them. Requiring a chosen
  // suggestion meant the ETA silently never appeared for anyone who just typed
  // their postcode and carried on.
  //
  // Polled rather than asked once: a driver coming on or off duty changes the
  // answer completely, and someone sitting on this screen filling in a phone
  // number should not be looking at a figure that stopped being true while
  // they typed.
  useEffect(() => {
    if (pickup.length < 3) {
      setLiveEta(null);
      return;
    }
    const controller = new AbortController();
    let poll: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      let at = pickupPin;
      if (!at) {
        try {
          at = await resolveLocation(pickup, controller.signal);
        } catch {
          at = null;
        }
      }
      if (!at || controller.signal.aborted) {
        setLiveEta(null);
        return;
      }
      const ask = () =>
        void fetchEta(at.lat, at.lng, controller.signal).then((quote) => {
          if (!controller.signal.aborted) setLiveEta(quote);
        });
      ask();
      poll = setInterval(ask, ETA_POLL_MS);
    };
    // A chosen suggestion needs no geocoding, so it can be asked straight away.
    const delay = setTimeout(() => void run(), pickupPin ? 0 : ETA_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(delay);
      if (poll) clearInterval(poll);
    };
  }, [pickupPin, pickup]);

  // Move focus to the first meaningful element of each step for keyboard/SR users.
  useEffect(() => {
    const target =
      formStep === 1
        ? locationRef.current
        : formStep === 2
          ? serviceRef.current
          : confirmRef.current;
    target?.focus();
  }, [formStep]);

  // The quoted price: flat for roadside jobs, distance-based for tows, with an
  // out-of-hours uplift. `null` until a tow's distance is known.
  const isNight =
    quoteData.timing === 'later'
      ? quoteData.scheduledFor
        ? isNightHour(quoteData.scheduledFor)
        : false
      : isNightHour(new Date());
  // What the customer typed wins: "M60 J17" is a clearer statement of where
  // they are than a reverse-geocode of a coordinate on a slip road.
  const motorway = detectMotorway(quoteData.location) ?? motorwayAtPin;

  // The pickup as the customer would recognise it. "Current location
  // (54.9727, -1.6039)" is exactly what the operator wants to see and exactly
  // what a customer should not be read back.
  const friendlyPickup = /^current location/i.test(quoteData.location.trim())
    ? 'your current location'
    : quoteData.location;

  // Suggestions come back as long chains ("Kwik Fit, John Street, Fernhill,
  // Bury, BL9 0LD"), which would swamp the sentence it sits in.
  const shortPickup = pickup.split(',').slice(0, 2).join(',').trim() || 'your pickup';

  const price = estimatePrice({
    service: quoteData.service,
    distanceMiles: estimate?.loadedMiles,
    deadheadMiles: estimate?.deadheadMiles,
    motorway: motorway !== null,
    night: isNight,
  });

  const handleGetLocation = () => {
    setSubmitError(null);
    if (!('geolocation' in navigator)) {
      setSubmitError('Geolocation is not supported by your browser. Please type your location.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setQuoteData((prev) => ({
          ...prev,
          location: `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
        }));
        // The device just told us exactly where it is; that beats anything a
        // geocoder could infer from the string we formatted out of it.
        setPickupPin({ lat: latitude, lng: longitude });
        setIsLocating(false);
      },
      () => {
        setSubmitError('Could not get your location. Please type it in or grant location access.');
        setIsLocating(false);
      },
      GEO_OPTIONS,
    );
  };

  // Fired once when someone first engages with the form, so the funnel's
  // second step counts people rather than keystrokes.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current && pickup.length >= 3) {
      startedRef.current = true;
      track('booking_started');
    }
  }, [pickup]);

  const goToStep2 = () => {
    const error = validateQuote(quoteData, 'contact');
    if (error) {
      setSubmitError(error);
      return;
    }
    setSubmitError(null);
    track('details_done', { timing: quoteData.timing });
    setFormStep(2);
  };

  const chooseService = (service: string) => {
    setQuoteData((prev) => ({ ...prev, service }));
    if (service) track('service_chosen', { service });
  };

  // What the customer was actually shown, and the conditions behind it: the
  // question the operator has is whether a driver being on duty wins the job.
  const quotedRef = useRef<number | null>(null);
  useEffect(() => {
    if (price === null || quotedRef.current === price) return;
    quotedRef.current = price;
    track('quote_shown', {
      price,
      service: quoteData.service,
      night: isNight,
      motorway: motorway !== null,
      towMiles: estimate?.loadedMiles ?? null,
      driverAvailable: liveEta?.source === 'driver',
      etaMinutes: liveEta?.etaMinutes ?? null,
    });
  }, [price, quoteData.service, isNight, motorway, estimate, liveEta]);

  const handleBookingSubmit = async () => {
    // aria-disabled buttons still fire a click; the validator below is what
    // actually stops the submit and names the missing field out loud.
    const error = validateQuote(quoteData, 'full');
    if (error) {
      setSubmitError(error);
      track('form_error', { step: 'dispatch' });
      return;
    }
    setSubmitError(null);
    track('dispatch_requested', { service: quoteData.service, price: price ?? null });
    setSubmitting(true);

    // Resolve the pickup to a map pin so the operator's alert can link straight
    // to it. Strictly best-effort: a geocoder that is slow, rate-limited or
    // simply wrong must never stand between a stranded customer and a booking,
    // so any failure just sends the booking without coordinates.
    const pickupText = quoteData.location.trim();
    let pin: LatLng | null = pickupPin;
    if (!pin) {
      try {
        pin = await resolveLocation(pickupText);
      } catch {
        /* geocoder unavailable — the email falls back to an address search */
      }
    }

    try {
      const result = await submitBooking({
        region: regionName,
        location: pickupText,
        pickupLat: pin?.lat,
        pickupLng: pin?.lng,
        destination: quoteData.destination.trim() || undefined,
        // One consistent shape, so the operator reads "07700 900123" whether
        // the customer typed +447700900123 or 07700-900-123.
        phone: formatPhone(quoteData.phone),
        service: quoteData.service,
        vehicle: quoteData.vehicle.trim() || undefined,
        timing: quoteData.timing,
        scheduledFor:
          quoteData.timing === 'later' && quoteData.scheduledFor
            ? quoteData.scheduledFor.toISOString()
            : undefined,
        distanceMiles: estimate?.loadedMiles,
        durationMinutes: estimate?.loadedMinutes,
        motorway: motorway !== null,
        price: price ?? undefined,
      });
      setConfirmedEta(result.eta);
      setDriverAssigned(result.etaSource === 'driver');
      setConfirmedToken(result.trackToken ?? null);
      track('booking_confirmed', {
        price: price ?? null,
        service: quoteData.service,
        etaMinutes: result.eta,
        driverAssigned: result.etaSource === 'driver',
        queued: result.mode === 'local',
      });
      setConfirmedPrice(price);
      setFormStep(3);
    } catch (err) {
      console.error('booking failed', err);
      setSubmitError('Could not send your request. Please call us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const errorMessage = submitError && (
    <p
      role="alert"
      className="text-[var(--color-danger-soft)] text-xs font-bold uppercase tracking-wider text-center pt-1"
    >
      {submitError}
    </p>
  );

  // The address the customer is actually on, not SITE_URL: a link to share has
  // to open today, and the canonical domain may not be pointed here yet.
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  const trackingUrl = confirmedToken ? `${origin}${trackPath(confirmedToken)}` : null;

  return (
    <div className="bg-neutral-950 text-white rounded-none relative lg:mt-0 mt-4 shadow-xl">
      <div className="absolute -top-3 left-5 bg-yellow-400 text-neutral-950 font-black px-3 py-1.5 rounded-none text-[11px] sm:text-xs uppercase tracking-[0.15em] z-20 flex items-center gap-2 border-2 border-neutral-950">
        <div className="w-1.5 h-1.5 bg-red-600 rounded-none animate-pulse"></div>
        {metrics.isLive ? 'Live Dispatch' : '24/7 Dispatch'}
      </div>

      {/* Dispatch metrics (live from the backend, or representative figures) */}
      <div className="grid grid-cols-2 border-b-2 border-yellow-400 pt-6 sm:pt-7">
        <div className="flex flex-col items-center px-4 py-2.5 sm:py-5 border-r border-neutral-800">
          <div className="text-[10px] sm:text-xs text-red-500 font-black mb-0.5 sm:mb-1 uppercase tracking-[0.2em]">
            {metrics.measured ? 'Measured Response' : 'Avg Response'}
          </div>
          <div className="font-display text-2xl sm:text-4xl flex items-baseline gap-1 text-yellow-400">
            <CountUp value={metrics.avgResponseMinutes} />
            <span className="text-xs sm:text-sm font-bold text-neutral-500">min</span>
          </div>
        </div>
        <ActivityStat />
      </div>

      <div className="p-4 sm:p-7 w-full">
        <h2 className="text-white font-sans font-extrabold text-xl sm:text-3xl tracking-tight mb-2">
          Get Back On The Road
        </h2>

        {/* A price anchor before any details are handed over. Being asked for
            your number before you know the cost is what makes people fear a
            stitch-up at the worst possible moment. Derived from pricing.ts so
            this line can't drift out of date. */}
        <p className="text-[11px] sm:text-xs text-neutral-400 font-medium mb-3 sm:mb-5 leading-relaxed">
          From <span className="text-yellow-400 font-bold">{formatPrice(FROM_PRICE)}</span>. You see
          the full price before you confirm, then track your driver live. No hidden fees.
        </p>

        <div
          className={`relative ${
            formStep === 2
              ? 'min-h-[440px]'
              : formStep === 1 && quoteData.timing === 'later'
                ? 'min-h-[372px]'
                : 'min-h-[280px]'
          }`}
        >
          {/* `initial={false}`: the first step must render fully visible in
              the prerendered HTML, not sat at opacity 0 waiting for a script. */}
          <AnimatePresence mode="wait" initial={false}>
            {formStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-3.5 absolute inset-0"
              >
                <div
                  className="flex bg-neutral-900 p-1 rounded-none border border-neutral-800"
                  role="tablist"
                  aria-label="When do you need help?"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={quoteData.timing === 'now'}
                    onClick={() => setQuoteData({ ...quoteData, timing: 'now' })}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all ${quoteData.timing === 'now' ? 'bg-yellow-400 text-neutral-950' : 'text-neutral-400 hover:text-white'}`}
                  >
                    Need Help Now
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={quoteData.timing === 'later'}
                    onClick={() => setQuoteData({ ...quoteData, timing: 'later' })}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all ${quoteData.timing === 'later' ? 'bg-yellow-400 text-neutral-950' : 'text-neutral-400 hover:text-white'}`}
                  >
                    Schedule Later
                  </button>
                </div>
                {quoteData.timing === 'later' && (
                  // A scheduled job is usually a collection from somewhere the
                  // customer isn't standing — a garage, a driveway, an auction
                  // house — so the question is asked in full above the field
                  // rather than as a placeholder, which a phone would clip
                  // halfway through and read as broken.
                  <label
                    htmlFor="pickup-location"
                    className="block text-[11px] font-black uppercase tracking-[0.15em] text-yellow-400"
                  >
                    Where are we picking up the car from?
                  </label>
                )}
                <PlaceInput
                  id="pickup-location"
                  inputRef={locationRef}
                  value={quoteData.location}
                  onChange={(location, pin) => {
                    setQuoteData({ ...quoteData, location });
                    setPickupPin(pin);
                  }}
                  // Kept short so it isn't clipped by the Find Me button on a
                  // narrow phone — a half-truncated placeholder reads as broken.
                  placeholder={
                    quoteData.timing === 'now'
                      ? 'Postcode or street'
                      : 'Postcode, street or auction'
                  }
                  ariaLabel="Pickup location"
                  className="w-full pl-11 sm:pl-12 pr-[96px] sm:pr-[110px] py-3.5 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-400"
                >
                  <MapPin className="absolute left-4 w-5 h-5 text-neutral-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    className="absolute right-1.5 px-2.5 sm:px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-bold text-xs rounded-none transition-all flex items-center gap-1 sm:gap-1.5 active:scale-95"
                    title="Use my current location"
                    aria-label="Use my current location"
                  >
                    {isLocating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Crosshair className="w-3.5 h-3.5" />
                    )}
                    <span className="uppercase tracking-tight">Find Me</span>
                  </button>
                </PlaceInput>
                <div className="relative">
                  <Phone className="absolute left-4 top-[14px] w-5 h-5 text-neutral-400 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Your Phone Number"
                    className="w-full pl-12 pr-4 py-3.5 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-400"
                    value={quoteData.phone}
                    onChange={(e) => setQuoteData({ ...quoteData, phone: e.target.value })}
                    // Tidy on the way out, so the customer sees the number read
                    // back the way it will be rung — and can spot a typo in it.
                    onBlur={() =>
                      setQuoteData((prev) => ({ ...prev, phone: formatPhone(prev.phone) }))
                    }
                    aria-label="Your phone number"
                  />
                </div>
                {quoteData.timing === 'later' && (
                  <div className="relative">
                    <Calendar
                      className="absolute left-4 top-[14px] w-5 h-5 text-yellow-400 pointer-events-none z-10"
                      aria-hidden="true"
                    />
                    <Flatpickr
                      value={quoteData.scheduledFor ?? undefined}
                      onChange={([d]) => setQuoteData({ ...quoteData, scheduledFor: d ?? null })}
                      options={{
                        enableTime: true,
                        time_24hr: true,
                        minuteIncrement: 15,
                        minDate: 'today',
                        dateFormat: 'D j M, H:i',
                        defaultDate: defaultScheduledDate(),
                        position: 'above right',
                        disableMobile: true,
                      }}
                      className="w-full pl-12 pr-4 py-3.5 rounded-none border-2 border-yellow-400/40 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-400 cursor-pointer"
                      placeholder="Pick a date and time"
                      aria-label="When do you need help? Date and time"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={goToStep2}
                  className="w-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-4 rounded-none transition-all flex items-center justify-center gap-2 text-base uppercase tracking-wider mt-4 shadow-sm hover:shadow-md"
                >
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </button>
                {errorMessage}
              </motion.div>
            )}

            {formStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-3.5 absolute inset-0"
              >
                <div className="relative">
                  <Wrench className="absolute left-4 top-[14px] w-5 h-5 text-neutral-400 pointer-events-none" />
                  <select
                    ref={serviceRef}
                    className="w-full pl-12 pr-10 py-3.5 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium appearance-none transition-all"
                    value={quoteData.service}
                    onChange={(e) => chooseService(e.target.value)}
                    aria-label="What do you need help with?"
                  >
                    <option value="" disabled>
                      What do you need help with?
                    </option>
                    {SERVICE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-4 w-5 h-5 text-neutral-400 pointer-events-none" />
                </div>
                {needsDestination && (
                  <PlaceInput
                    value={quoteData.destination}
                    onChange={(destination, pin) => {
                      setQuoteData({ ...quoteData, destination });
                      setDropoffPin(pin);
                    }}
                    placeholder="Where do you need to go? (Drop-off)"
                    ariaLabel="Drop-off location"
                    className="w-full pl-12 pr-4 py-3.5 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-400"
                  >
                    <Navigation className="absolute left-4 w-5 h-5 text-neutral-400 pointer-events-none" />
                  </PlaceInput>
                )}
                {/* Optional, and said to be. A driver looking for "silver
                    Focus, AB12 CDE" finds it; one looking for "a car" does
                    not. But nobody on a hard shoulder is made to find their
                    V5C before help is sent. */}
                <div className="relative">
                  <Car className="absolute left-4 top-[14px] w-5 h-5 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    autoComplete="off"
                    maxLength={VEHICLE_MAX_LENGTH}
                    placeholder="Reg or make & model (optional)"
                    className="w-full pl-12 pr-4 py-3.5 rounded-none border-2 border-neutral-800 bg-neutral-900 focus:bg-black focus:border-yellow-400 outline-none text-white font-medium transition-all placeholder:text-neutral-400"
                    value={quoteData.vehicle}
                    onChange={(e) => setQuoteData({ ...quoteData, vehicle: e.target.value })}
                    aria-label="Vehicle registration or make and model (optional)"
                  />
                </div>

                {motorway !== null && (
                  // Shown whenever the surcharge applies, so the customer is
                  // never charged £40 they can't account for — and, far more
                  // importantly, because a hard shoulder kills people. Anyone
                  // who tells us they are on a motorway gets told to get out
                  // and get behind the barrier before anything about price.
                  <div
                    role="alert"
                    className="rounded-none border-2 border-yellow-400 bg-yellow-400/10 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-yellow-400 font-black text-[11px] uppercase tracking-[0.15em]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {motorway} · Motorway recovery
                    </div>
                    <p className="text-neutral-200 text-[11px] font-medium leading-relaxed mt-2">
                      <strong>Get out of the left-hand doors and stand behind the barrier</strong>,
                      away from your vehicle. Don't attempt a repair on the hard shoulder. In
                      immediate danger, call 999; otherwise National Highways on 0300 123 5000.
                    </p>
                    <p className="text-neutral-400 text-[11px] font-medium mt-2">
                      Motorway callout includes a £{MOTORWAY_SURCHARGE} surcharge for working a live
                      carriageway.
                    </p>
                  </div>
                )}

                {liveEta && liveEta.driversOnDuty === 0 && (
                  // Said plainly, but never as a dead end: the form still takes
                  // the booking and the phone number is right there, because a
                  // customer at the roadside being told "no" and nothing else
                  // is a customer ringing somebody else.
                  <div className="flex items-start gap-2.5 border-2 border-neutral-700 bg-neutral-900 px-4 py-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-500 mt-1" />
                    <p className="text-[11px] font-medium text-neutral-300 leading-relaxed">
                      <span className="font-black uppercase tracking-wider text-neutral-400">
                        No drivers on duty right now
                      </span>
                      <br />
                      Leave your details and we&apos;ll call you straight back, or ring{' '}
                      <a
                        href={`tel:${PHONE_TEL}`}
                        data-call="form-no-drivers"
                        className="font-bold text-yellow-400 underline"
                      >
                        {PHONE_DISPLAY}
                      </a>{' '}
                      now.
                    </p>
                  </div>
                )}

                {liveEta && liveEta.source === 'driver' && liveEta.etaMinutes !== null && (
                  // Two genuinely different things to say. A free driver is a
                  // reason to book now; everyone being mid-job is a longer wait
                  // that reads as honest rather than slow once the reason is
                  // given. Either way the pickup is named, so the number is
                  // plainly an ETA to *their* location and not a generic claim.
                  <div className="flex items-start gap-2.5 border-2 border-yellow-400 bg-yellow-400/10 px-4 py-3">
                    <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-60 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    </span>
                    <p className="text-[11px] font-medium text-neutral-200 leading-relaxed">
                      <span className="font-black uppercase tracking-wider text-yellow-400">
                        {liveEta.queueMinutes > 0 ? 'All drivers on a job' : 'Driver available now'}
                      </span>
                      <br />
                      {liveEta.queueMinutes > 0 ? 'Next driver can be' : 'Can be'} with you at{' '}
                      <span className="font-bold text-white">{shortPickup}</span> in about{' '}
                      <span className="font-display text-base text-yellow-400">
                        {liveEta.etaMinutes} min
                      </span>
                    </p>
                  </div>
                )}

                {!quoteData.service && (
                  <p className="rounded-none border-2 border-neutral-800 bg-black/40 px-4 py-3 min-h-[60px] flex items-center justify-center text-center text-[11px] text-neutral-400 font-medium">
                    Choose what you need help with to see your price
                  </p>
                )}

                {quoteData.service && (
                  <div
                    className="rounded-none border-2 border-neutral-800 bg-black/40 px-4 py-3 min-h-[60px] flex items-center"
                    aria-live="polite"
                  >
                    {needsDestination && dropoff.length < 3 ? (
                      <p className="w-full text-center text-[11px] text-neutral-400 font-medium">
                        Add a drop-off address to reveal your price
                      </p>
                    ) : estimateStatus === 'loading' ? (
                      <div className="w-full flex items-center justify-center gap-2 text-[11px] text-neutral-400 font-bold uppercase tracking-wider">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating your price…
                      </div>
                    ) : price !== null ? (
                      <div className="w-full">
                        <PriceReveal price={price} estimate={estimate} night={isNight} />
                      </div>
                    ) : (
                      <p className="w-full text-center text-[11px] text-neutral-400 font-medium">
                        We'll confirm your exact price on the call.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      setFormStep(1);
                    }}
                    className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white p-4 rounded-none transition-colors border-2 border-neutral-800"
                    aria-label="Go back"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleBookingSubmit}
                    disabled={submitting}
                    aria-disabled={cannotDispatch}
                    className={`flex-1 bg-yellow-400 text-neutral-950 font-display py-4 rounded-none transition-all flex items-center justify-center gap-2 text-base uppercase tracking-wider shadow-sm ${
                      cannotDispatch
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-yellow-300 hover:shadow-md'
                    } disabled:bg-yellow-400/50 disabled:cursor-not-allowed`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Sending…
                      </>
                    ) : quoteData.timing === 'later' ? (
                      <>
                        Book Collection <ArrowRight className="w-5 h-5" />
                      </>
                    ) : (
                      <>
                        Request Dispatch <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
                {errorMessage}
              </motion.div>
            )}

            {formStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center"
                role="status"
                aria-live="polite"
              >
                <div className="bg-yellow-400 text-neutral-950 rounded-none p-3 mb-4 inline-flex">
                  <CheckCheck className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3
                  ref={confirmRef}
                  tabIndex={-1}
                  className="font-display text-2xl text-white uppercase tracking-tight outline-none"
                >
                  {confirmedPrice === null || !driverAssigned
                    ? 'Request received'
                    : quoteData.timing === 'later'
                      ? 'Booking confirmed'
                      : 'Driver dispatched'}
                </h3>
                <p className="text-neutral-300 text-sm mt-2 max-w-xs">
                  {confirmedPrice === null ? (
                    // No price could be calculated, so nothing has been agreed and
                    // no truck is moving. Saying "driver dispatched" here would be
                    // a promise the business hasn't made — and worse, it could stop
                    // someone stranded from ringing anyone else.
                    <>
                      We've got your details for{' '}
                      <span className="text-yellow-400 font-bold">{friendlyPickup}</span>. We'll
                      ring you on{' '}
                      <span className="text-yellow-400 font-bold">{quoteData.phone}</span> to
                      confirm the price, then send a driver.
                    </>
                  ) : !driverAssigned ? (
                    // Nobody was on duty with a fresh position when this was
                    // sent, so no truck is moving and saying otherwise would be
                    // a promise nobody made.
                    <>
                      We&apos;ve got your details for{' '}
                      <span className="text-yellow-400 font-bold">{friendlyPickup}</span>. No driver
                      is free this second. We&apos;ll contact you as soon as possible on{' '}
                      <span className="text-yellow-400 font-bold">{quoteData.phone}</span>.
                    </>
                  ) : quoteData.timing === 'later' ? (
                    <>
                      We'll meet you at{' '}
                      <span className="text-yellow-400 font-bold">{friendlyPickup}</span>.
                    </>
                  ) : (
                    <>
                      Help is on the way to{' '}
                      <span className="text-yellow-400 font-bold">{friendlyPickup}</span>.
                    </>
                  )}
                </p>
                {confirmedPrice !== null && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 17, delay: 0.15 }}
                    className="mt-4 bg-yellow-400 text-neutral-950 px-5 py-2 rounded-none shadow-sm flex items-baseline gap-2"
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                      Your price
                    </span>
                    <span className="font-display text-2xl leading-none">£{confirmedPrice}</span>
                  </motion.div>
                )}
                {confirmedPrice === null && quoteData.timing === 'now' ? (
                  // Deliberately no ETA: an arrival countdown is the same false
                  // promise as the heading, and the wait hasn't started yet.
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
                      Next step
                    </span>
                    <span className="font-display text-xl text-yellow-400">We'll call you</span>
                  </div>
                ) : quoteData.timing === 'later' ? (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
                      Scheduled for
                    </span>
                    <span className="font-display text-xl text-yellow-400">
                      {formatScheduledFor(quoteData.scheduledFor)}
                    </span>
                  </div>
                ) : driverAssigned ? (
                  // Measured from where a driver actually is, so it can be
                  // stated as an arrival time.
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
                      Arriving in
                    </span>
                    <span className="font-display text-4xl text-yellow-400">
                      {confirmedEta ?? 24}
                    </span>
                    <span className="text-neutral-500 font-bold text-sm">min</span>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <span className="text-xs text-red-400 font-black tracking-[0.2em] uppercase">
                      Next step
                    </span>
                    <span className="font-display text-xl text-yellow-400">
                      We&apos;ll call you
                    </span>
                  </div>
                )}

                {confirmedToken && trackingUrl ? (
                  // The "Uber" part. A page that shows the driver who has the
                  // job, a live ETA and the truck on a map. Offered as a link
                  // rather than a redirect so the confirmation stays readable.
                  <div className="mt-5 w-full max-w-xs flex flex-col items-center gap-2">
                    <Link
                      to={trackPath(confirmedToken)}
                      className="w-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-3.5 rounded-none flex items-center justify-center gap-2 text-base uppercase tracking-wider shadow-sm hover:shadow-md"
                    >
                      <Navigation className="w-5 h-5" /> Track your driver
                    </Link>
                    <CopyLink url={trackingUrl} />
                  </div>
                ) : (
                  <p className="mt-5 text-[11px] text-neutral-500 max-w-xs">
                    Your request is saved on this phone and will be sent the moment we have signal.
                    If you can, ring us so we know you are waiting.
                  </p>
                )}

                <a
                  href={`tel:${PHONE_TEL}`}
                  data-call="confirmation"
                  className="mt-4 text-red-400 hover:text-red-300 font-display text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Need to talk? Call {PHONE_DISPLAY}
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-neutral-400 font-medium mt-4 flex items-center justify-center gap-1.5 border-t border-neutral-900 pt-4">
          <ShieldCheck className="w-4 h-4 text-yellow-400" />
          Sent over a secure, encrypted connection
        </p>
        <p className="text-center text-[11px] text-neutral-500 mt-2 leading-relaxed">
          By requesting dispatch you agree we may contact you about your recovery. See our{' '}
          <Link to="/privacy" className="underline hover:text-neutral-300">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
