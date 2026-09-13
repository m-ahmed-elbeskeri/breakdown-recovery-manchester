// Which page a path is, decided once and shared by the router, the SEO layer
// and the build-time prerender. The router in App.tsx renders what this says;
// scripts/prerender.mjs asks it which paths exist and what their <head> is.

import { HOME_REGION, REGIONS, regionFromSlug, regionPath, isLegacyRegionSlug } from './config';
import type { Region } from './config';
import { SERVICE_PAGES, serviceFromSlug, servicePath, type ServicePage } from './services';

export type PageMatch =
  | { kind: 'region'; region: Region; legacy: boolean }
  | { kind: 'service'; page: ServicePage }
  | { kind: 'pricing' }
  | { kind: 'privacy' }
  | { kind: 'recruit' };

const PRICING_PATH = '/pricing';
const RECRUIT_PATH = '/drive-with-us';

/** Classify a pathname, or `null` for anything that should be a 404. */
export function matchPage(pathname: string): PageMatch | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'region', region: HOME_REGION, legacy: false };
  if (path === PRICING_PATH) return { kind: 'pricing' };
  if (path === '/privacy') return { kind: 'privacy' };
  if (path === RECRUIT_PATH) return { kind: 'recruit' };

  const slug = path.slice(1);
  if (slug.includes('/')) return null;

  const service = serviceFromSlug(slug);
  if (service) return { kind: 'service', page: service };

  const region = regionFromSlug(slug);
  if (region) return { kind: 'region', region, legacy: isLegacyRegionSlug(slug) };

  return null;
}

/** Every public, indexable page. Order is the sitemap order. */
export function prerenderPaths(): string[] {
  return [
    '/',
    PRICING_PATH,
    ...SERVICE_PAGES.map(servicePath),
    ...REGIONS.filter((r) => r !== HOME_REGION).map(regionPath),
    RECRUIT_PATH,
  ];
}

export { PRICING_PATH, RECRUIT_PATH };
