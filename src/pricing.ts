// The price a customer is quoted for a job. Constants here are a sensible
// starting tariff for a demo/launch — the operating business tunes them in one
// place. The number is presented as an upfront estimate, confirmed on the call.
//
//   Tow jobs:      callout fee + (loaded miles × per-mile rate)
//   Roadside jobs: a flat attendance fee (jump start, tyre, out-of-fuel)
//   Out-of-hours:  a night multiplier (22:00–06:00)
// Rounded to a clean whole figure so the customer gets one confident price.

/** Dispatch + attendance fee for a tow job, before per-mile charges. */
export const CALLOUT_FEE = 45;
/** Loaded tow rate, per mile. */
export const PER_MILE = 2.9;
/** Multiplier applied to out-of-hours (22:00–06:00) jobs. */
export const NIGHT_MULTIPLIER = 1.2;

/** Flat attendance fees for jobs fixed at the roadside (no tow distance). */
export const ROADSIDE_FEES: Record<string, number> = {
  jumpstart: 45,
  tyre: 55,
  fuel: 40,
};

/**
 * The lowest figure any job can start at — the "from £X" anchor shown before a
 * customer hands over their details. Derived from the tariff above so it can
 * never drift out of date when rates are tuned.
 */
export const FROM_PRICE = Math.min(CALLOUT_FEE, ...Object.values(ROADSIDE_FEES));

const roundTo5 = (n: number): number => Math.round(n / 5) * 5;

export const isNightHour = (date: Date): boolean => {
  const hour = date.getHours();
  return hour >= 22 || hour < 6;
};

/**
 * The quoted price for a job, or `null` when it can't be computed yet (a tow
 * whose distance is still unknown). Tow services need `distanceMiles`; roadside
 * services use a flat fee.
 */
export function estimatePrice(opts: {
  service: string;
  distanceMiles?: number;
  night?: boolean;
}): number | null {
  const flat = ROADSIDE_FEES[opts.service];

  let base: number;
  if (flat !== undefined) {
    base = flat;
  } else if (opts.distanceMiles !== undefined) {
    base = CALLOUT_FEE + opts.distanceMiles * PER_MILE;
  } else {
    return null;
  }

  if (opts.night) base *= NIGHT_MULTIPLIER;
  return roundTo5(base);
}

/** Format a price as "£75". */
export const formatPrice = (price: number): string => `£${price}`;
