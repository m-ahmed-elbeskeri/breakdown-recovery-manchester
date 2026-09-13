// Prerender every public page to static HTML, and write the sitemap.
//
//   npm run build   (runs this after the client and SSR builds)
//
// Why: the site is a React app, and until this existed every URL was an empty
// <div id="root"> until the JavaScript arrived. Google renders JavaScript but
// queues it and ranks a blank first paint poorly; other crawlers and link
// previews do not render it at all. Now each of the ~50 public pages is a
// complete HTML file with its own title, description, canonical URL, social
// tags and JSON-LD, and React attaches to it on load (see src/main.tsx).
//
// Hosting note: pages are written as dist/<page>.html, not
// dist/<page>/index.html. Cloudflare Pages serves a folder's index.html only
// at the trailing-slash URL and 308-redirects /car-recovery-bolton to
// /car-recovery-bolton/, which would put a redirect in front of every URL in
// the sitemap and every canonical link. A .html file is served at the clean
// path directly (and /car-recovery-bolton.html redirects to it).

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const templatePath = path.join(dist, 'index.html');

if (!existsSync(templatePath)) {
  console.error('dist/index.html is missing. Run `vite build` first.');
  process.exit(1);
}
const entry = path.join(ssrDir, 'entry-server.js');
if (!existsSync(entry)) {
  console.error('dist-ssr/entry-server.js is missing. Run the SSR build first.');
  process.exit(1);
}

const { render, prerenderPaths, legacyRedirects } = await import(pathToFileURL(entry).href);
const template = readFileSync(templatePath, 'utf8');

const escapeAttr = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Replace one <meta …="key" content="…"> however prettier wrapped it. */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/>`);
  if (!re.test(html)) throw new Error(`template has no <meta ${attr}="${key}">`);
  return html.replace(re, `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`);
}

function applyHead(html, seo) {
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(seo.title)}</title>`);
  out = setMeta(out, 'name', 'description', seo.description);
  out = setMeta(out, 'property', 'og:title', seo.title);
  out = setMeta(out, 'property', 'og:description', seo.description);
  out = setMeta(out, 'property', 'og:url', seo.url);
  out = setMeta(out, 'name', 'twitter:title', seo.title);
  out = setMeta(out, 'name', 'twitter:description', seo.description);
  out = out.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapeAttr(seo.url)}" />`,
  );
  const scripts = seo.jsonLd
    .map((json) => `<script type="application/ld+json" data-jsonld>${json}</script>`)
    .join('\n    ');
  return out.replace('</head>', `    ${scripts}\n  </head>`);
}

const SLOT = '<div id="root"><!--app-html--></div>';
if (!template.includes(SLOT))
  throw new Error('template has no <div id="root"><!--app-html--></div> slot');

// The shell for the app-only routes: /track/<token>, the driver and admin
// areas, sign-in and password pages, and /privacy. dist/_redirects (written below) sends those here rather than to
// index.html, which is now the prerendered homepage — serving that for a
// tracking link meant a flash of the homepage followed by React discarding
// it with a hydration error. An empty root is rendered from scratch instead.
writeFileSync(path.join(dist, 'app.html'), template.replace(SLOT, '<div id="root"></div>'));

const paths = prerenderPaths();
let written = 0;
for (const route of paths) {
  const { html, seo } = render(route);
  if (!seo) throw new Error(`no SEO data for ${route}`);
  let page = applyHead(template, seo);
  // The path is stamped on the root so the client only hydrates HTML that was
  // rendered for the page it is actually on (see src/main.tsx).
  page = page.replace(SLOT, `<div id="root" data-prerendered="${escapeAttr(route)}">${html}</div>`);

  const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
  writeFileSync(path.join(dist, file), page);
  written += 1;
}
console.log(`prerendered ${written} pages`);

// The sitemap, from the same list, so a new area or service page can never be
// forgotten. Area pages change rarely; the homepage and prices more often.
const today = new Date().toISOString().slice(0, 10);
const origin = new URL(render('/').seo.url).origin;
const urls = paths
  .map((route) => {
    const priority =
      route === '/'
        ? '1.0'
        : route === '/pricing'
          ? '0.9'
          : route.startsWith('/car-recovery-')
            ? '0.7'
            : route === '/drive-with-us'
              ? '0.5'
              : '0.8';
    const changefreq = route === '/' || route === '/pricing' ? 'weekly' : 'monthly';
    return `  <url>\n    <loc>${origin}${route === '/' ? '/' : route}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  })
  .join('\n');
writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`wrote sitemap.xml with ${paths.length} URLs`);

// dist/_redirects, replacing the client-only fallback copied from public/.
//
// Cloudflare Pages applies these rules BEFORE static files ("Redirects are
// always followed, regardless of whether or not an asset matches"), so there
// is deliberately no catch-all: `/* /app 200` would serve the empty shell for
// every prerendered page. Only paths with no file of their own are rewritten.
// Anything else unknown falls through to Pages' built-in SPA handling, which
// serves index.html; src/main.tsx sees it was rendered for a different path
// and renders the 404 page from scratch.
//
// The target is /app, not /app.html. Cloudflare's pretty URLs 308-redirect
// /app.html to /app, and a rewrite that ends in a redirect sends the browser
// to /app, throwing away the tracking token in the address it came from.
const APP_ROUTES = [
  '/track/*',
  '/driver',
  '/driver/*',
  '/admin',
  '/admin/*',
  '/drivers/apply',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/privacy',
];
const redirectLines = [
  '# Generated by scripts/prerender.mjs at build time. Edit that, not this.',
  '',
  '# Old area URLs, moved permanently.',
  ...legacyRedirects().map(([from, to]) => `${from}  ${to}  301`),
  '',
  '# App-only routes: the empty shell, rendered in the browser.',
  ...APP_ROUTES.map((route) => `${route}  /app  200`),
  '',
];
writeFileSync(path.join(dist, '_redirects'), redirectLines.join('\n'));
console.log(`wrote _redirects with ${legacyRedirects().length} legacy redirects`);

rmSync(ssrDir, { recursive: true, force: true });
