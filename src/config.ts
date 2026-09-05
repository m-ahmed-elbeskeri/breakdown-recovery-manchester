// Site-wide constants and region routing helpers — the single source of truth
// for anything that appears in more than one place (phone number, URL, regions).

export const SITE_URL = 'https://breakdown-recovery-manchester.co.uk';
export const PHONE_TEL = '+447442384141';
export const PHONE_DISPLAY = '07442 384141';
export const HOME_REGION = 'Manchester';

/** The trading name. Used in titles, structured data and the copyright line. */
export const BRAND_NAME = 'Recovery Mayte';

/**
 * The wordmark, split so the second half can be accented in a different colour.
 * Rendered as `{BRAND_WORDMARK[0]}<span class="wordmark-paint">{BRAND_WORDMARK[1]}</span>`.
 */
export const BRAND_WORDMARK = ['RECOVERY', 'MAYTE!'] as const;

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

/** The URL path for a region ('/' for the home region, '/breakdown-recovery-x' otherwise). */
export const regionPath = (region: string): string =>
  region === HOME_REGION ? '/' : `/breakdown-recovery-${slugify(region)}`;

/**
 * Resolve a route slug (e.g. "breakdown-recovery-bolton") to its canonical
 * region name, or `null` if the slug does not correspond to a served area.
 * Returning `null` lets the router render a real 404 instead of silently
 * falling back to Manchester (which would create soft-404 duplicate pages).
 */
export const regionFromSlug = (slug: string | undefined): Region | null => {
  if (!slug) return HOME_REGION;
  const clean = slug.replace(/^breakdown-recovery-/, '');
  return REGIONS.find((r) => slugify(r) === clean) ?? null;
};
