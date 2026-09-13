import { describe, expect, it } from 'vitest';
import { checkPhone, formatPhone } from './phone';

const formatted = (input: string) => {
  const result = checkPhone(input);
  return result.ok ? result.formatted : `invalid: ${result.error}`;
};

describe('checkPhone — accepted numbers', () => {
  it.each([
    ['07700900123', '07700 900123'],
    ['07700 900 123', '07700 900123'],
    ['+44 7700 900123', '07700 900123'],
    ['+447700900123', '07700 900123'],
    ['0044 7700 900123', '07700 900123'],
    ['447700900123', '07700 900123'],
    ['+44 (0)7700 900123', '07700 900123'],
    ['07624 123456', '07624 123456'],
  ])('mobile %s', (input, expected) => {
    expect(formatted(input)).toBe(expected);
  });

  it.each([
    ['01614960000', '0161 496 0000'],
    ['(0161) 496-0000', '0161 496 0000'],
    ['+44 (0)161 496 0000', '0161 496 0000'],
    ['02079460018', '020 7946 0018'],
    ['03001234567', '0300 123 4567'],
    ['01204 123456', '01204 123456'],
    ['0169771234', '01697 71234'],
  ])('landline %s', (input, expected) => {
    expect(formatted(input)).toBe(expected);
  });

  it('keeps a foreign number in international form', () => {
    expect(formatted('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(formatted('00353 87 123 4567')).toBe('+353871234567');
  });
});

describe('checkPhone — rejected numbers', () => {
  const error = (input: string) => {
    const result = checkPhone(input);
    return result.ok ? null : result.error;
  };

  it.each(['', '   ', '1234567', '12345', 'call me', '07700 90012', '077009001234', '0161 496 000'])(
    'rejects %j',
    (input) => {
      expect(error(input)).toMatch(/valid phone/i);
    },
  );

  it('explains a mobile that is a digit short', () => {
    expect(error('0770090012')).toMatch(/short/i);
  });

  it('refuses premium, personal and pager ranges nobody can ring back', () => {
    expect(error('09001234567')).toMatch(/08 or 09/);
    expect(error('08001234567')).toMatch(/08 or 09/);
    expect(error('07012345678')).toMatch(/mobile number we can ring/);
    expect(error('07612345678')).toMatch(/mobile number we can ring/);
  });

  it('points someone typing 999 at the emergency services', () => {
    expect(error('999')).toMatch(/call 999 now/i);
  });

  it('rejects a + anywhere but the start', () => {
    expect(error('0770+0900123')).toMatch(/\+ can only go at the start/);
  });

  it('rejects an international number that is too short to be real', () => {
    expect(error('+33 612')).toMatch(/incomplete/);
  });
});

describe('formatPhone', () => {
  it('tidies a valid number and leaves an invalid one as typed', () => {
    expect(formatPhone(' 07700900123 ')).toBe('07700 900123');
    expect(formatPhone(' 12345 ')).toBe('12345');
  });
});
