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

describe('formatPrice', () => {
  it('renders a single £ figure', () => {
    expect(formatPrice(75)).toBe('£75');
  });
});
