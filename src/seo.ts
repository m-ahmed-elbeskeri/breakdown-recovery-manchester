// Everything a page puts in <head>: title, description, canonical, social
// tags and JSON-LD. Built as plain data by pure functions so the same head
// can be written into the HTML at build time (scripts/prerender.mjs, which
// is what search engines read) and kept in sync in the browser on navigation.

import { useEffect } from 'react';
import {
  SITE_URL,
  PHONE_TEL,
  PHONE_DISPLAY,
  HOME_REGION,
  BRAND_NAME,
  CONTACT_EMAIL,
  regionPath,
} from './config';
import { buildFaqItems, type FaqItem } from './data';
import { FROM_PRICE } from './pricing';
import { PRICING_FAQ } from './pricingContent';
import { RECRUIT_FAQ } from './recruitContent';
import { PRICING_PATH, RECRUIT_PATH, matchPage } from './routes';
import { servicePath, type ServicePage } from './services';

export interface PageSeo {
  title: string;
  description: string;
  /** The canonical path, starting with "/". */
  path: string;
  robots?: string;
  jsonLd: Record<string, unknown>[];
}

const INDEX_ROBOTS = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

export const absoluteUrl = (path: string): string => `${SITE_URL}${path === '/' ? '/' : path}`;

const opening = [
  {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '00:00',
    closes: '23:59',
  },
];

const faqJsonLd = (items: FaqItem[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
});

const breadcrumbJsonLd = (crumbs: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: absoluteUrl(c.path),
  })),
});

/** An area page: the homepage for Manchester, /car-recovery-<area> otherwise. */
export function regionSeo(regionName: string): PageSeo {
  const isHome = regionName === HOME_REGION;
  const path = regionPath(regionName);
  const url = absoluteUrl(path);

  const title = isHome
    ? `24/7 Car Recovery Manchester | ${BRAND_NAME}`
    : `Car Recovery ${regionName} | 24/7 Breakdown Recovery Near Me`;
  const description = isHome
    ? `Stuck? See your price up front from £${FROM_PRICE}, get a live ETA and track your recovery driver to your door. 24/7 car recovery, towing and roadside help across Greater Manchester. Call ${PHONE_DISPLAY}.`
    : `24/7 car recovery and breakdown recovery in ${regionName}. Price shown up front from £${FROM_PRICE}, live ETA, and track your driver to your door. Call ${PHONE_DISPLAY}.`;

  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': ['LocalBusiness', 'AutomotiveBusiness'],
      '@id': `${url}#business`,
      name: BRAND_NAME,
      url,
      telephone: PHONE_TEL,
      email: CONTACT_EMAIL,
      priceRange: '££',
      image: `${SITE_URL}/og-image.png`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: regionName,
        addressRegion: 'Greater Manchester',
        addressCountry: 'GB',
      },
      areaServed: { '@type': 'City', name: regionName },
      openingHoursSpecification: opening,
    },
    faqJsonLd(buildFaqItems(regionName)),
  ];
  if (!isHome) {
    jsonLd.push(
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: `Car Recovery ${regionName}`, path },
      ]),
    );
  }

  return { title, description, path, jsonLd };
}

/** A service page, e.g. /jump-start-near-me. */
export function serviceSeo(page: ServicePage): PageSeo {
  const path = servicePath(page);
  return {
    title: page.title,
    description: page.description,
    path,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        '@id': `${absoluteUrl(path)}#service`,
        name: page.name,
        serviceType: page.headline.join(' ').replace(/\.$/, ''),
        url: absoluteUrl(path),
        provider: { '@id': `${SITE_URL}/#organization` },
        areaServed: { '@type': 'AdministrativeArea', name: 'Greater Manchester' },
        availableChannel: {
          '@type': 'ServiceChannel',
          serviceUrl: absoluteUrl(path),
          servicePhone: { '@type': 'ContactPoint', telephone: PHONE_TEL },
        },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'GBP',
          price: page.fromPrice,
          priceSpecification: {
            '@type': 'PriceSpecification',
            priceCurrency: 'GBP',
            minPrice: page.fromPrice,
            description: page.priceNote,
          },
          availability: 'https://schema.org/InStock',
        },
        hoursAvailable: opening,
      },
      faqJsonLd(page.faq),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: page.name, path },
      ]),
    ],
  };
}

/** The pricing page. */
export function pricingSeo(): PageSeo {
  return {
    title: `Car Recovery Prices Manchester | From £${FROM_PRICE}, No Hidden Fees`,
    description: `Exactly what breakdown recovery costs in Manchester: callout fees, price per mile, night and motorway rates, with worked examples. See your own price before you book. Call ${PHONE_DISPLAY}.`,
    path: PRICING_PATH,
    jsonLd: [
      faqJsonLd(PRICING_FAQ),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Prices', path: PRICING_PATH },
      ]),
    ],
  };
}

/** The page for recovery drivers looking for work. */
export function recruitSeo(): PageSeo {
  return {
    title: 'Recovery Driver Jobs Manchester | Drive With Us',
    description: `Recovery and tow truck drivers wanted across Greater Manchester. Choose your hours, get jobs on your phone with the price shown, and apply online with your licence and documents. Call ${PHONE_DISPLAY}.`,
    path: RECRUIT_PATH,
    jsonLd: [
      faqJsonLd(RECRUIT_FAQ),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Drive with us', path: RECRUIT_PATH },
      ]),
    ],
  };
}

/**
 * The head for any prerendered path, or null for pages that are not public
 * (tracking, admin, driver, 404). Used by the build; the pages themselves
 * call the builders above directly.
 */
export function seoForPath(pathname: string): PageSeo | null {
  const match = matchPage(pathname);
  if (!match) return null;
  switch (match.kind) {
    case 'region':
      return match.legacy ? null : regionSeo(match.region);
    case 'service':
      return serviceSeo(match.page);
    case 'pricing':
      return pricingSeo();
    case 'privacy':
      return null;
    case 'recruit':
      return recruitSeo();
  }
}

// ── The browser side ────────────────────────────────────────────────────────

const setMeta = (attr: 'name' | 'property', key: string, value: string) => {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
};

const setCanonical = (href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
};

const clearJsonLd = () => {
  document.head.querySelectorAll('script[data-jsonld]').forEach((el) => el.remove());
};

/** JSON safe to sit inside a <script> tag. */
export const jsonLdText = (data: Record<string, unknown>): string =>
  JSON.stringify(data).replace(/</g, '\\u003c');

/** Write a page's head into the live document. */
export function applySeo(seo: PageSeo): void {
  const url = absoluteUrl(seo.path);
  document.title = seo.title;
  setMeta('name', 'robots', seo.robots ?? INDEX_ROBOTS);
  setMeta('name', 'description', seo.description);
  setCanonical(url);
  setMeta('property', 'og:title', seo.title);
  setMeta('property', 'og:description', seo.description);
  setMeta('property', 'og:url', url);
  setMeta('name', 'twitter:title', seo.title);
  setMeta('name', 'twitter:description', seo.description);

  clearJsonLd();
  for (const data of seo.jsonLd) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', '');
    script.textContent = jsonLdText(data);
    document.head.appendChild(script);
  }
}

/** Keep the document head in sync with the page being shown. */
export function usePageSeo(seo: PageSeo): void {
  // Dependencies are the parts that can change on navigation; the JSON-LD
  // follows from them.
  useEffect(() => {
    applySeo(seo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seo.path, seo.title, seo.description]);
}

/** Mark a page as private so search engines never index it. */
export function useNoIndex(title: string): void {
  useEffect(() => {
    document.title = `${title} | ${BRAND_NAME}`;
    setMeta('name', 'robots', 'noindex, nofollow');
    clearJsonLd();
  }, [title]);
}
