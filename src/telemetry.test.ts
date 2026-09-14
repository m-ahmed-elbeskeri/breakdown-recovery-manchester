// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  browserFrom,
  campaignFrom,
  clean,
  deviceFrom,
  isBotAgent,
  isTrackedPath,
  safePath,
  tag,
  trackPageView,
  type EventPayload,
} from './telemetry';

interface SentEvent {
  name: string;
  path: string;
  payload?: EventPayload;
}

/** Every event the page sent through the mocked fetch. */
const sentEvents = (fetchMock: ReturnType<typeof vi.fn>): SentEvent[] =>
  fetchMock.mock.calls.flatMap(
    ([, init]) => (JSON.parse((init as RequestInit).body as string) as { events: SentEvent[] }).events,
  );

describe('page views and time on page', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports how long a page was on screen, as plain text the API can take cross-site', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    sessionStorage.clear();

    trackPageView('/pricing', 'pricing');
    vi.advanceTimersByTime(7_000);
    trackPageView('/', 'home');
    vi.advanceTimersByTime(5_000);

    const events = sentEvents(fetchMock);
    expect(events.find((e) => e.name === 'page_engagement')).toMatchObject({
      path: '/pricing',
      payload: { seconds: 7, kind: 'pricing' },
    });
    expect(
      events.filter((e) => e.name === 'page_view').map((e) => [e.path, e.payload?.landing]),
    ).toEqual([
      ['/pricing', true],
      ['/', false],
    ]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=UTF-8');
  });

  it('never records a signed-in staff or driver page', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    trackPageView('/admin/drivers/2', 'other');
    trackPageView('/driver/documents', 'other');
    vi.advanceTimersByTime(5_000);

    expect(sentEvents(fetchMock).some((e) => /^\/(admin|driver)(\/|$)/.test(e.path))).toBe(false);
  });
});

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  facebookApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0]',
};

describe('safePath', () => {
  it('never keeps a tracking link token', () => {
    expect(safePath('/track/7f3a9c2b1e')).toBe('/track');
  });
  it('drops a trailing slash but keeps the homepage', () => {
    expect(safePath('/car-recovery-bolton/')).toBe('/car-recovery-bolton');
    expect(safePath('/')).toBe('/');
  });
});

describe('isTrackedPath', () => {
  it('ignores the pages staff and drivers use after signing in', () => {
    for (const p of ['/admin', '/admin/drivers/3', '/driver', '/driver/documents', '/login', '/reset-password', '/forgot-password']) {
      expect(isTrackedPath(p)).toBe(false);
    }
  });
  it('measures public pages, the tracking page and the driver application', () => {
    for (const p of ['/', '/pricing', '/drive-with-us', '/drivers/apply', '/track/abc']) {
      expect(isTrackedPath(p)).toBe(true);
    }
  });
});

describe('isBotAgent', () => {
  it('spots search engines, link previews and speed testers', () => {
    expect(isBotAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBotAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true);
    expect(isBotAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/128.0 Safari/537.36')).toBe(true);
    expect(isBotAgent('Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse')).toBe(true);
  });
  it('leaves real browsers, including social media in-app ones, alone', () => {
    for (const ua of Object.values(UA)) expect(isBotAgent(ua)).toBe(false);
  });
});

describe('browserFrom and deviceFrom', () => {
  it('names the browser family', () => {
    expect(browserFrom(UA.iphoneSafari)).toBe('safari');
    expect(browserFrom(UA.chrome)).toBe('chrome');
    expect(browserFrom(UA.edge)).toBe('edge');
    expect(browserFrom(UA.samsung)).toBe('samsung');
    expect(browserFrom(UA.facebookApp)).toBe('facebook app');
  });
  it('sorts phones, tablets and computers', () => {
    expect(deviceFrom(UA.iphoneSafari)).toBe('mobile');
    expect(deviceFrom(UA.samsung)).toBe('mobile');
    expect(deviceFrom(UA.ipad)).toBe('tablet');
    expect(deviceFrom(UA.chrome)).toBe('desktop');
  });
});

describe('campaignFrom', () => {
  it('reads advert tags as plain labels', () => {
    expect(
      campaignFrom('?utm_source=Facebook&utm_medium=paid_social&utm_campaign=September Launch!'),
    ).toEqual({ utmSource: 'facebook', utmMedium: 'paid_social', utmCampaign: 'september-launch' });
  });
  it('credits Google and Facebook click ids', () => {
    expect(campaignFrom('?gclid=abc123')).toEqual({ utmSource: 'google-ads', utmMedium: 'cpc' });
    expect(campaignFrom('?fbclid=xyz')).toEqual({ utmSource: 'facebook' });
  });
  it('returns nothing for an untagged visit', () => {
    expect(campaignFrom('')).toEqual({});
    expect(tag('   ')).toBeNull();
  });
});

describe('clean', () => {
  it('keeps short scalars and drops anything else', () => {
    const payload = {
      price: 90,
      motorway: false,
      eta: null,
      service: 'towing',
      address: 'x'.repeat(41),
      nested: { phone: '07700900123' },
    } as unknown as EventPayload;
    expect(clean(payload)).toEqual({ price: 90, motorway: false, eta: null, service: 'towing' });
  });
});
