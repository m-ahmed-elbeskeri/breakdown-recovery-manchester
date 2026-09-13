import { describe, it, expect } from 'vitest';
import { regionSeo, serviceSeo, pricingSeo, seoForPath, jsonLdText, absoluteUrl } from './seo';
import { BRAND_NAME, SITE_URL, HOME_REGION } from './config';
import { SERVICE_PAGES } from './services';

const types = (seo: { jsonLd: Record<string, unknown>[] }) =>
  seo.jsonLd.map((d) => d['@type']).flat();

describe('regionSeo', () => {
  it('gives the homepage the brand and Manchester in the title', () => {
    const seo = regionSeo(HOME_REGION);
    expect(seo.path).toBe('/');
    expect(seo.title).toContain('Manchester');
    expect(seo.title).toContain(BRAND_NAME);
    expect(seo.title.length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(220);
  });

  it('names the area and the search phrase for an area page', () => {
    const seo = regionSeo('Bolton');
    expect(seo.path).toBe('/car-recovery-bolton');
    expect(seo.title).toMatch(/^Car Recovery Bolton/);
    expect(seo.description).toContain('Bolton');
  });

  it('carries LocalBusiness and FAQ data, plus breadcrumbs off the homepage', () => {
    expect(types(regionSeo(HOME_REGION))).toContain('FAQPage');
    expect(types(regionSeo(HOME_REGION))).not.toContain('BreadcrumbList');
    expect(types(regionSeo('Sale'))).toContain('BreadcrumbList');
    expect(types(regionSeo('Sale'))).toContain('LocalBusiness');
  });

  it('keeps the visible FAQ and the FAQ structured data identical', () => {
    const faq = regionSeo('Wigan').jsonLd.find((d) => d['@type'] === 'FAQPage') as {
      mainEntity: { name: string }[];
    };
    expect(faq.mainEntity.some((q) => q.name.includes('Wigan'))).toBe(true);
  });
});

describe('serviceSeo', () => {
  it('describes the service with a price offer and breadcrumbs', () => {
    const page = SERVICE_PAGES.find((p) => p.slug === 'jump-start-near-me')!;
    const seo = serviceSeo(page);
    expect(seo.path).toBe('/jump-start-near-me');
    const service = seo.jsonLd.find((d) => d['@type'] === 'Service') as {
      offers: { price: number };
    };
    expect(service.offers.price).toBe(page.fromPrice);
    expect(types(seo)).toContain('FAQPage');
    expect(types(seo)).toContain('BreadcrumbList');
  });
});

describe('pricingSeo', () => {
  it('is the prices page with its FAQ', () => {
    const seo = pricingSeo();
    expect(seo.path).toBe('/pricing');
    expect(types(seo)).toContain('FAQPage');
  });
});

describe('seoForPath', () => {
  it('answers for every public page', () => {
    expect(seoForPath('/')?.path).toBe('/');
    expect(seoForPath('/car-recovery-bolton')?.title).toContain('Bolton');
    expect(seoForPath('/tow-truck-near-me')?.path).toBe('/tow-truck-near-me');
    expect(seoForPath('/pricing')?.path).toBe('/pricing');
  });

  it('refuses to give the old area URLs a head of their own (they redirect)', () => {
    expect(seoForPath('/breakdown-recovery-bolton')).toBeNull();
  });

  it('has nothing for private or unknown pages', () => {
    expect(seoForPath('/privacy')).toBeNull();
    expect(seoForPath('/track/abc')).toBeNull();
    expect(seoForPath('/nope')).toBeNull();
  });
});

describe('helpers', () => {
  it('builds absolute URLs on the live domain', () => {
    expect(absoluteUrl('/')).toBe(`${SITE_URL}/`);
    expect(absoluteUrl('/pricing')).toBe(`${SITE_URL}/pricing`);
  });

  it('escapes "<" so JSON-LD can never close its own script tag', () => {
    expect(jsonLdText({ name: '</script><b>' })).not.toContain('</script>');
  });
});
