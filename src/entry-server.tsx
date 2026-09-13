// The build-time renderer. scripts/prerender.mjs builds this with Vite's SSR
// mode and calls `render` once per public path, writing the result into
// dist/<path>/index.html so search engines and slow connections get the whole
// page as HTML rather than an empty <div id="root">.

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import { AppRoutes } from './App';
import { matchPage, prerenderPaths } from './routes';
import { seoForPath, jsonLdText, absoluteUrl } from './seo';
import { HOME_REGION, REGIONS, regionPath, slugify } from './config';

/**
 * Old area URL → new area URL, one pair per area.
 *
 * Listed one by one rather than as a `/breakdown-recovery-*` wildcard because
 * Cloudflare Pages applies redirects before static files: a wildcard would
 * also catch the /breakdown-recovery-manchester service page and send it to a
 * page that does not exist. Any old path that is now a real page is skipped.
 */
export function legacyRedirects(): [string, string][] {
  return REGIONS.filter((r) => r !== HOME_REGION)
    .map((r): [string, string] => [`/breakdown-recovery-${slugify(r)}`, regionPath(r)])
    .filter(([from]) => matchPage(from)?.kind !== 'service');
}

export function render(path: string) {
  const html = renderToString(
    <MotionConfig reducedMotion="user">
      <StaticRouter location={path}>
        <AppRoutes />
      </StaticRouter>
    </MotionConfig>,
  );
  const seo = seoForPath(path);
  return {
    html,
    seo: seo
      ? {
          ...seo,
          url: absoluteUrl(seo.path),
          jsonLd: seo.jsonLd.map(jsonLdText),
        }
      : null,
  };
}

export { prerenderPaths };
