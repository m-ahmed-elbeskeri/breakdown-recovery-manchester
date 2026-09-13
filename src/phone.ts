// UK-first phone validation for the booking form.
//
// A booking lives or dies on this number: the operator rings it to confirm the
// price and the driver rings it from the roadside. "At least seven digits" let
// through numbers nobody could ring back — a premium-rate 09, a mobile missing
// a digit, 1234567 — and the job arrived with no way to reach the customer.
// The backend applies the same rules (backend/app/phone.py), so a request that
// skips this form is held to them too.

export type PhoneCheck = { ok: true; formatted: string } | { ok: false; error: string };

/** Digits plus the punctuation people genuinely type into a phone number. */
const ALLOWED = /^[\d\s()+.-]+$/;

const EMERGENCY = new Set(['999', '112', '911']);

const fail = (reason: string): PhoneCheck => ({
  ok: false,
  error: `Please enter a valid phone number — ${reason}`,
});

/** 011x and 01x1 are the big-city codes (0113 Leeds, 0161 Manchester). */
const isCityCode = (d: string): boolean => d[2] === '1' || d[3] === '1';

/** "020 7946 0018", "0161 496 0000", "01234 567890": how each range is written. */
function formatLandline(d: string): string {
  if (d.startsWith('02')) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.startsWith('03')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 11 && isCityCode(d)) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

function lengthProblem(length: number): string {
  return length < 11
    ? 'it looks a digit or two short. UK numbers have 11 digits, like 07700 900123.'
    : 'it has too many digits. UK numbers have 11, like 07700 900123.';
}

/** A national-format UK number, leading 0 included. */
function checkUk(d: string): PhoneCheck {
  if (!d.startsWith('0')) return fail('UK numbers start with 0 or +44.');

  switch (d[1]) {
    case '7': {
      if (d.length !== 11) return fail(lengthProblem(d.length));
      // 070 is a "personal number" that forwards anywhere at a premium, and
      // 076 is pagers — except 07624, which is Isle of Man mobiles.
      if (d.startsWith('070') || (d.startsWith('076') && !d.startsWith('07624'))) {
        return fail("that isn't a mobile number we can ring.");
      }
      return { ok: true, formatted: `${d.slice(0, 5)} ${d.slice(5)}` };
    }
    case '1':
    case '2':
    case '3':
      // A handful of small 01 areas still have ten-digit numbers; the city
      // codes never do, so "0161 496 000" is a digit short, not a village.
      if (d.length === 11 || (d[1] === '1' && d.length === 10 && !isCityCode(d))) {
        return { ok: true, formatted: formatLandline(d) };
      }
      return fail(lengthProblem(d.length));
    case '8':
    case '9':
      return fail("we can't ring back an 08 or 09 number. A mobile or landline, please.");
    default:
      return fail('please use a UK mobile or landline.');
  }
}

export function checkPhone(input: string): PhoneCheck {
  const raw = input.trim();
  if (!raw) return fail('we need it so the driver can reach you.');
  if (!ALLOWED.test(raw)) return fail('use digits only.');
  if (raw.lastIndexOf('+') > 0) return fail('a + can only go at the start.');

  // "+44 (0)161 …" is how plenty of people write it; the (0) is never dialled.
  let digits = raw.replace(/\(0\)/g, '').replace(/\D/g, '');
  const international = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (!international && EMERGENCY.has(digits)) {
    return {
      ok: false,
      error: 'If anyone is hurt or in danger, call 999 now. Otherwise enter your own number.',
    };
  }

  // UK in international form, with or without the +: back to national.
  if (digits.startsWith('44')) return checkUk(`0${digits.slice(2).replace(/^0/, '')}`);

  if (international) {
    // E.164 allows up to 15 digits; nothing real is shorter than 8.
    if (digits.length < 8 || digits.length > 15)
      return fail('that international number looks incomplete.');
    return { ok: true, formatted: `+${digits}` };
  }

  return checkUk(digits);
}

/** The tidy form of a valid number, or the input trimmed if it isn't one. */
export function formatPhone(input: string): string {
  const result = checkPhone(input);
  return result.ok ? result.formatted : input.trim();
}
