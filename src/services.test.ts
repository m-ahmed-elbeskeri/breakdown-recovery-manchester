import { describe, it, expect } from 'vitest';
import { SERVICE_PAGES, serviceFromSlug, servicePath } from './services';
import { SERVICE_OPTIONS } from './data';
import { REGIONS, regionPath } from './config';
import { FROM_PRICE } from './pricing';

describe('service pages', () => {
  it('have unique slugs that never collide with an area page or a fixed route', () => {
    const slugs = SERVICE_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const areaPaths = new Set(REGIONS.map(regionPath));
    for (const page of SERVICE_PAGES) {
      expect(areaPaths.has(servicePath(page))).toBe(false);
      expect(['pricing', 'privacy', 'admin', 'driver', 'track']).not.toContain(page.slug);
      expect(page.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('preselect a service the booking form actually offers', () => {
    const values = new Set(SERVICE_OPTIONS.map((o) => o.value));
    for (const page of SERVICE_PAGES) expect(values.has(page.service)).toBe(true);
  });

  it('keep titles and descriptions inside what search results show', () => {
    for (const page of SERVICE_PAGES) {
      expect(page.title.length, page.slug).toBeLessThanOrEqual(65);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(200);
      expect(page.description).toMatch(/07442 384141/);
    }
  });

  it('each answer at least three questions and have real copy', () => {
    for (const page of SERVICE_PAGES) {
      expect(page.faq.length, page.slug).toBeGreaterThanOrEqual(3);
      expect(page.body.join(' ').length, page.slug).toBeGreaterThan(400);
      expect(page.included.length).toBeGreaterThanOrEqual(3);
      expect(page.steps.length).toBe(3);
      expect(page.headline).toHaveLength(2);
    }
  });

  it('never quote a price below the site-wide "from" figure', () => {
    for (const page of SERVICE_PAGES) expect(page.fromPrice).toBeGreaterThanOrEqual(FROM_PRICE);
  });

  it('never use an em dash in customer-facing copy', () => {
    for (const page of SERVICE_PAGES) {
      const text = [page.intro, page.priceNote, ...page.body, ...page.faq.map((f) => f.a)].join(
        ' ',
      );
      expect(text, page.slug).not.toContain('—');
    }
  });

  it('resolve from a slug, and nothing else', () => {
    expect(serviceFromSlug('tow-truck-near-me')?.service).toBe('tow');
    expect(serviceFromSlug('nope')).toBeNull();
    expect(serviceFromSlug(undefined)).toBeNull();
  });
});
