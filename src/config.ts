// Site-wide constants and region routing helpers — the single source of truth
// for anything that appears in more than one place (phone number, URL, regions).

/**
 * The live domain. carrecoverynearme.uk was unregistered at Nominet on
 * 2026-09-13 (the .co.uk is taken, as are recoverynearme.co.uk and .uk). It is
 * an exact match for "car recovery near me", the most-searched recovery phrase
 * in the UK, which is the whole reason for the name.
 */
export const SITE_URL = 'https://carrecoverynearme.uk';
export const PHONE_TEL = '+447442384141';
export const PHONE_DISPLAY = '07442 384141';
export const CONTACT_EMAIL = 'hello@carrecoverynearme.uk';
export const HOME_REGION = 'Manchester';

/**
 * Where the recovery trucks live. Every job starts and ends here, so this is
 * what makes "empty running" (base → pickup, drop-off → base) chargeable: a
 * two-mile tow twenty miles from base costs far more to serve than a two-mile
 * tow next door, and quoting only the loaded miles hid that entirely.
 */
export const BASE_LOCATION = 'M6 5UA';

/**
 * The trading name. Used in titles, structured data and the copyright line.
 * Chosen for search intent: "car recovery near me" is what a stranded driver
 * actually types, and the name answers it.
 */
export const BRAND_NAME = 'Car Recovery Near Me';

/** One line under the name, for the driver app and social cards. */
export const BRAND_TAGLINE = 'Price up front. Track your driver to your door.';

/**
 * The wordmark, split so the second half can be accented in a different colour.
 * Rendered as `{BRAND_WORDMARK[0]}<span class="wordmark-paint">{BRAND_WORDMARK[1]}</span>`.
 */
export const BRAND_WORDMARK = ['CAR RECOVERY', 'NEAR ME'] as const;

/** Every area we serve. The first entry is the homepage region. */
export const REGIONS = [
  'Manchester',
  'Wigan',
  'Stockport',
  'Bolton',
  'Salford',
  'Oldham',
  'Bredbury and Romiley',
  'Failsworth',
  'Irlam',
  'Hyde',
  'Eccles',
  'Denton',
  'Radcliffe',
  'Prestwich',
  'Chadderton',
  'Heywood',
  'Droylsden',
  'Whitefield',
  'Rochdale',
  'Cheadle and Gatley',
  'Bury',
  'Sale',
  'Worsley',
  'Middleton',
  'Stalybridge',
  'Walkden',
  'Hale',
  'Leigh',
  'Ashton Under Lyne',
  'Stretford',
  'Hazel Grove and Bramhall',
  'Urmston',
  'Altrincham',
  'Saddleworth',
  'Farnworth',
  'Marple',
] as const;

export type Region = (typeof REGIONS)[number];

export const slugify = (text: string): string => text.toLowerCase().replace(/ /g, '-');

/**
 * The URL prefix for an area page. "car-recovery-bolton" puts the phrase
 * people search for in the URL itself. The old "breakdown-recovery-" prefix
 * is still accepted by `regionFromSlug` and 301-redirected by public/_redirects
 * so nothing that was ever linked goes dead.
 */
export const REGION_PATH_PREFIX = 'car-recovery-';
const LEGACY_REGION_PREFIX = 'breakdown-recovery-';

/** The URL path for a region ('/' for the home region, '/car-recovery-x' otherwise). */
export const regionPath = (region: string): string =>
  region === HOME_REGION ? '/' : `/${REGION_PATH_PREFIX}${slugify(region)}`;

/**
 * Resolve a route slug (e.g. "car-recovery-bolton") to its canonical region
 * name, or `null` if the slug does not correspond to a served area. Returning
 * `null` lets the router render a real 404 instead of silently falling back to
 * Manchester (which would create soft-404 duplicate pages).
 */
export const regionFromSlug = (slug: string | undefined): Region | null => {
  if (!slug) return HOME_REGION;
  if (!slug.startsWith(REGION_PATH_PREFIX) && !slug.startsWith(LEGACY_REGION_PREFIX)) return null;
  const clean = slug.replace(REGION_PATH_PREFIX, '').replace(LEGACY_REGION_PREFIX, '');
  return REGIONS.find((r) => slugify(r) === clean) ?? null;
};

/** Whether a slug uses the old prefix and should be redirected to `regionPath`. */
export const isLegacyRegionSlug = (slug: string | undefined): boolean =>
  !!slug && slug.startsWith(LEGACY_REGION_PREFIX);

/** The customer's live tracking page for a booking. */
export const trackPath = (token: string): string => `/track/${token}`;
