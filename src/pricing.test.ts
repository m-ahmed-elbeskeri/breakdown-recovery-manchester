import { describe, it, expect } from 'vitest';
import {
  estimatePrice,
  formatPrice,
  isNightHour,
  CALLOUT_FEE,
  PER_MILE,
  NIGHT_MULTIPLIER,
} from './pricing';

describe('isNightHour', () => {
  it('treats 22:00–05:59 as out-of-hours', () => {
    expect(isNightHour(new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isNightHour(new Date(2026, 0, 1, 3, 0))).toBe(true);
  });
  it('treats daytime as standard hours', () => {
    expect(isNightHour(new Date(2026, 0, 1, 9, 0))).toBe(false);
    expect(isNightHour(new Date(2026, 0, 1, 21, 59))).toBe(false);
  });
});

describe('estimatePrice — roadside (flat fee) jobs', () => {
  it('prices a jump start at its flat fee, ignoring distance', () => {
    expect(estimatePrice({ service: 'jumpstart' })).toBe(45);
  });
  it('prices a tyre job', () => {
    expect(estimatePrice({ service: 'tyre' })).toBe(55);
  });
});

describe('estimatePrice — tow jobs', () => {
  it('returns null until a distance is known', () => {
    expect(estimatePrice({ service: 'towing' })).toBeNull();
  });

  it('charges callout + per-mile, rounded to a clean figure', () => {
    // 10 miles: 45 + 10*2.9 = 74 → rounds to 75
    expect(estimatePrice({ service: 'towing', distanceMiles: 10 })).toBe(
      Math.round((CALLOUT_FEE + 10 * PER_MILE) / 5) * 5,
    );
  });

  it('applies the night multiplier for out-of-hours jobs', () => {
    const day = estimatePrice({ service: 'towing', distanceMiles: 10, night: false })!;
    const night = estimatePrice({ service: 'towing', distanceMiles: 10, night: true })!;
    expect(night).toBeGreaterThan(day);
    expect(night / day).toBeCloseTo(NIGHT_MULTIPLIER, 1);
  });
});

describe('estimatePrice — empty running', () => {
  it('does not charge for empty miles inside the free allowance', () => {
    const near = estimatePrice({ service: 'jumpstart', deadheadMiles: 10 });
    expect(near).toBe(estimatePrice({ service: 'jumpstart' }));
  });

  it('charges a distant roadside job for the miles beyond the allowance', () => {
    // 40 empty miles: 24 chargeable at £1.50 = £36 on top of the £45 flat fee.
    expect(estimatePrice({ service: 'jumpstart', deadheadMiles: 40 })).toBe(80);
  });

  it('adds empty running to a tow on top of the loaded miles', () => {
    // £45 callout + 10 loaded × £2.90 = £74, plus 14 chargeable empty × £1.50 = £21.
    expect(estimatePrice({ service: 'towing', distanceMiles: 10, deadheadMiles: 30 })).toBe(95);
  });

  it('prices a short tow far from base above a short tow next door', () => {
    const nearby = estimatePrice({ service: 'towing', distanceMiles: 2, deadheadMiles: 6 });
    const distant = estimatePrice({ service: 'towing', distanceMiles: 2, deadheadMiles: 60 });
    expect(distant).toBeGreaterThan(nearby!);
  });

  it('still returns null for a tow whose distance is unknown', () => {
    expect(estimatePrice({ service: 'towing', deadheadMiles: 30 })).toBeNull();
  });
});

describe('formatPrice', () => {
  it('renders a single £ figure', () => {
    expect(formatPrice(75)).toBe('£75');
  });
});
