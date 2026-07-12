import { describe, it, expect } from 'vitest';
import { validateQuote, type QuoteData } from './validation';

const base: QuoteData = {
  location: '12 Deansgate, Manchester',
  destination: '',
  phone: '07700 900123',
  service: '',
  timing: 'now',
  scheduledFor: null,
};

describe('validateQuote — contact phase', () => {
  it('accepts a valid "now" booking', () => {
    expect(validateQuote(base, 'contact')).toBeNull();
  });

  it('rejects a blank / whitespace-only location', () => {
    expect(validateQuote({ ...base, location: '   ' }, 'contact')).toMatch(/pickup location/i);
  });

  it('rejects a phone number with fewer than 7 digits', () => {
    expect(validateQuote({ ...base, phone: '12345' }, 'contact')).toMatch(/valid phone/i);
  });

  it('ignores non-digits when counting phone length', () => {
    expect(validateQuote({ ...base, phone: '(0161) 000-0000' }, 'contact')).toBeNull();
  });

  it('does not require a service in the contact phase', () => {
    expect(validateQuote({ ...base, service: '' }, 'contact')).toBeNull();
  });
});

describe('validateQuote — scheduled bookings', () => {
  const later = (scheduledFor: Date | null): QuoteData => ({
    ...base,
    timing: 'later',
    scheduledFor,
  });

  it('requires a date when scheduling for later', () => {
    expect(validateQuote(later(null), 'contact')).toMatch(/date and time/i);
  });

  it('rejects a scheduled time well in the past', () => {
    const pastByFiveMinutes = new Date(Date.now() - 5 * 60_000);
    expect(validateQuote(later(pastByFiveMinutes), 'contact')).toMatch(/future/i);
  });

  it('accepts a time just chosen (within the grace window)', () => {
    const justNow = new Date(Date.now() - 5_000);
    expect(validateQuote(later(justNow), 'contact')).toBeNull();
  });

  it('accepts a clearly future time', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    expect(validateQuote(later(tomorrow), 'contact')).toBeNull();
  });
});

describe('validateQuote — full phase', () => {
  it('requires a chosen service before dispatch', () => {
    expect(validateQuote({ ...base, service: '' }, 'full')).toMatch(/what you need help with/i);
  });

  it('accepts a fully completed booking', () => {
    expect(validateQuote({ ...base, service: 'towing' }, 'full')).toBeNull();
  });
});
