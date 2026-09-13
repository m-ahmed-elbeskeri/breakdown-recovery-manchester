import { describe, it, expect } from 'vitest';
import { matchPage, prerenderPaths } from './routes';
import { REGIONS, HOME_REGION, regionPath } from './config';
import { SERVICE_PAGES, servicePath } from './services';

describe('matchPage', () => {
  it('treats "/" as the home region', () => {
    expect(matchPage('/')).toEqual({ kind: 'region', region: HOME_REGION, legacy: false });
  });

  it('ignores a trailing slash', () => {
    expect(matchPage('/car-recovery-bolton/')).toEqual({
      kind: 'region',
      region: 'Bolton',
      legacy: false,
    });
  });

  it('flags the old area prefix as legacy so the router can redirect', () => {
    expect(matchPage('/breakdown-recovery-bolton')).toEqual({
      kind: 'region',
      region: 'Bolton',
      legacy: true,
    });
  });

  it('finds service pages by slug', () => {
    const match = matchPage('/jump-start-near-me');
    expect(match?.kind).toBe('service');
    if (match?.kind === 'service') expect(match.page.service).toBe('jumpstart');
  });

  it('knows the pricing and privacy pages', () => {
    expect(matchPage('/pricing')).toEqual({ kind: 'pricing' });
    expect(matchPage('/privacy')).toEqual({ kind: 'privacy' });
  });

  it('returns null for anything else', () => {
    expect(matchPage('/nope')).toBeNull();
    expect(matchPage('/track/abc')).toBeNull();
    expect(matchPage('/car-recovery-bolton/extra')).toBeNull();
  });
});

describe('prerenderPaths', () => {
  const paths = prerenderPaths();

  it('includes the homepage, prices, every service page and every area page', () => {
    expect(paths[0]).toBe('/');
    expect(paths).toContain('/pricing');
    for (const page of SERVICE_PAGES) expect(paths).toContain(servicePath(page));
    for (const region of REGIONS) {
      if (region !== HOME_REGION) expect(paths).toContain(regionPath(region));
    }
  });

  it('has no duplicates and every path is public', () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(matchPage(p)).not.toBeNull();
  });

  it('never includes the old area URLs', () => {
    expect(paths.some((p) => p.startsWith('/breakdown-recovery-') && p.endsWith('-bolton'))).toBe(
      false,
    );
  });
});
