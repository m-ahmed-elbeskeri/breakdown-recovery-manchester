// Region-aware SEO: dynamically updates document title, meta tags, canonical
// URL and JSON-LD structured data whenever the active region changes.

import { useEffect } from 'react';
import { SITE_URL, PHONE_TEL, PHONE_DISPLAY, HOME_REGION, slugify } from './config';
import { buildFaqItems } from './data';

const setMeta = (selector: string, attr: 'name' | 'property', key: string, value: string) => {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
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

const setRobots = (value: string) => {
  setMeta('meta[name="robots"]', 'name', 'robots', value);
};

const setStructuredData = (id: string, data: Record<string, unknown>) => {
  let script = document.head.querySelector<HTMLScriptElement>(`script[data-jsonld-id="${id}"]`);
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld-id', id);
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
};

const removeStructuredData = (id: string) => {
  document.head.querySelector(`script[data-jsonld-id="${id}"]`)?.remove();
};

/**
 * Keep the document head in sync with the active region for organic search.
 * Runs on every region change.
 */
export function useRegionSeo(regionName: string): void {
  useEffect(() => {
    const isHome = regionName === HOME_REGION;
    const canonicalPath = isHome ? '/' : `/breakdown-recovery-${slugify(regionName)}`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;

    const title = `24/7 Breakdown Recovery ${regionName} | Fast Towing`;
    const description = `24/7 breakdown recovery in ${regionName}. Avg 24-min response, fully insured, no hidden fees. Call ${PHONE_DISPLAY} for immediate towing & roadside help.`;

    document.title = title;
    setRobots('index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    setMeta('meta[name="description"]', 'name', 'description', description);
    setCanonical(canonicalUrl);

    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);

    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    setMeta('meta[name="geo.placename"]', 'name', 'geo.placename', regionName);

    setStructuredData('region-business', {
      '@context': 'https://schema.org',
      '@type': ['LocalBusiness', 'AutomotiveBusiness'],
      '@id': `${canonicalUrl}#business`,
      name: `24/7 Breakdown Recovery ${regionName}`,
      url: canonicalUrl,
      telephone: PHONE_TEL,
      priceRange: '££',
      image: `${SITE_URL}/og-image.svg`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: regionName,
        addressRegion: 'Greater Manchester',
        addressCountry: 'GB',
      },
      areaServed: { '@type': 'City', name: regionName },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          opens: '00:00',
          closes: '23:59',
        },
      ],
    });

    if (!isHome) {
      setStructuredData('region-breadcrumb', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Breakdown Recovery ${regionName}`,
            item: canonicalUrl,
          },
        ],
      });
    } else {
      removeStructuredData('region-breadcrumb');
    }

    setStructuredData('region-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: buildFaqItems(regionName).map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }, [regionName]);
}

/** Mark a page as not-found so search engines don't index soft-404s. */
export function useNoIndex(): void {
  useEffect(() => {
    document.title = 'Page not found | 24/7 Breakdown Recovery Manchester';
    setRobots('noindex, follow');
    removeStructuredData('region-business');
    removeStructuredData('region-breadcrumb');
    removeStructuredData('region-faq');
  }, []);
}
