import { describe, it, expect } from 'vitest';
import { regionFromSlug, regionPath, slugify, REGIONS, HOME_REGION } from './config';

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
    expect(regionFromSlug('breakdown-recovery-bolton')).toBe('Bolton');
  });

  it('resolves compound region slugs', () => {
    expect(regionFromSlug('breakdown-recovery-hazel-grove-and-bramhall')).toBe(
      'Hazel Grove and Bramhall',
    );
  });

  it('returns null for an unknown slug (so the router can 404)', () => {
    expect(regionFromSlug('breakdown-recovery-atlantis')).toBeNull();
    expect(regionFromSlug('totally-unrelated')).toBeNull();
  });
});

describe('regionPath', () => {
  it('routes the home region to "/"', () => {
    expect(regionPath(HOME_REGION)).toBe('/');
  });

  it('routes other regions to their prefixed path', () => {
    expect(regionPath('Bolton')).toBe('/breakdown-recovery-bolton');
  });
});

describe('routing round-trip', () => {
  it('every non-home region resolves back from the path it generates', () => {
    for (const region of REGIONS) {
      if (region === HOME_REGION) continue;
      const slug = regionPath(region).replace(/^\//, '');
      expect(regionFromSlug(slug)).toBe(region);
    }
  });
});
