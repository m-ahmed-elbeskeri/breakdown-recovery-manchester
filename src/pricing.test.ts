import { describe, it, expect } from 'vitest';
import {
  estimatePrice,
  formatPrice,
  isNightHour,
  CALLOUT_FEE,
  PER_MILE,
  NIGHT_MULTIPLIER,
  MOTORWAY_SURCHARGE,
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
    expect(estimatePrice({ service: 'jumpstart' })).toBe(55);
  });
  it('prices a tyre job', () => {
    expect(estimatePrice({ service: 'tyre' })).toBe(95);
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
    // 40 empty miles: 24 chargeable at £1.50 = £36 on top of the £55 flat fee.
    expect(estimatePrice({ service: 'jumpstart', deadheadMiles: 40 })).toBe(90);
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

describe('estimatePrice — motorway', () => {
  it('adds the surcharge for a live carriageway', () => {
    const normal = estimatePrice({ service: 'jumpstart' })!;
    const motorway = estimatePrice({ service: 'jumpstart', motorway: true })!;
    expect(motorway - normal).toBe(MOTORWAY_SURCHARGE);
  });

  it('compounds the night multiplier over the surcharge', () => {
    // (£55 + £40) x 1.2 = £114 -> £115
    expect(estimatePrice({ service: 'jumpstart', motorway: true, night: true })).toBe(115);
  });

  it('applies to tows as well as roadside jobs', () => {
    const plain = estimatePrice({ service: 'towing', distanceMiles: 10 })!;
    const mway = estimatePrice({ service: 'towing', distanceMiles: 10, motorway: true })!;
    expect(mway).toBeGreaterThan(plain);
  });
});

describe('formatPrice', () => {
  it('renders a single £ figure', () => {
    expect(formatPrice(75)).toBe('£75');
  });
});
