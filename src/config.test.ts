import { describe, it, expect } from 'vitest';
import {
  regionFromSlug,
  regionPath,
  slugify,
  isLegacyRegionSlug,
  trackPath,
  REGIONS,
  HOME_REGION,
  SITE_URL,
} from './config';

describe('slugify', () => {
  it('lowercases and hyphenates multi-word names', () => {
    expect(slugify('Ashton Under Lyne')).toBe('ashton-under-lyne');
    expect(slugify('Cheadle and Gatley')).toBe('cheadle-and-gatley');
  });
});

describe('regionFromSlug', () => {
  it('maps an undefined slug (the "/" route) to the home region', () => {
    expect(regionFromSlug(undefined)).toBe(HOME_REGION);
  });

  it('resolves a valid region slug to its canonical name', () => {
    expect(regionFromSlug('car-recovery-bolton')).toBe('Bolton');
  });

  it('still resolves the old prefix, so nothing ever linked goes dead', () => {
    expect(regionFromSlug('breakdown-recovery-bolton')).toBe('Bolton');
    expect(isLegacyRegionSlug('breakdown-recovery-bolton')).toBe(true);
    expect(isLegacyRegionSlug('car-recovery-bolton')).toBe(false);
  });

  it('resolves compound region slugs', () => {
    expect(regionFromSlug('car-recovery-hazel-grove-and-bramhall')).toBe(
      'Hazel Grove and Bramhall',
    );
  });

  it('returns null for an unknown slug (so the router can 404)', () => {
    expect(regionFromSlug('car-recovery-atlantis')).toBeNull();
    expect(regionFromSlug('totally-unrelated')).toBeNull();
    // A bare area name is not an area page; only the prefixed form is.
    expect(regionFromSlug('bolton')).toBeNull();
  });
});

describe('regionPath', () => {
  it('routes the home region to "/"', () => {
    expect(regionPath(HOME_REGION)).toBe('/');
  });

  it('puts the search phrase in the path for other regions', () => {
    expect(regionPath('Bolton')).toBe('/car-recovery-bolton');
  });
});

describe('routing round-trip', () => {
  it('every non-home region resolves back from the path it generates', () => {
    for (const region of REGIONS) {
      if (region === HOME_REGION) continue;
      const slug = regionPath(region).replace(/^\//, '');
      expect(regionFromSlug(slug)).toBe(region);
      expect(isLegacyRegionSlug(slug)).toBe(false);
    }
  });
});

describe('site identity', () => {
  it('lives on the .uk domain that was checked and available', () => {
    expect(SITE_URL).toBe('https://carrecoverynearme.uk');
  });

  it('builds a tracking path from a token', () => {
    expect(trackPath('abc123')).toBe('/track/abc123');
  });
});
