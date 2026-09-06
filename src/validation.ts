// Single source of truth for booking-form validation, shared by the step-1
// "Continue" gate and the final submit so the two can never disagree.

import { serviceNeedsDestination } from './data';

export interface QuoteData {
  location: string;
  destination: string;
  phone: string;
  service: string;
  timing: 'now' | 'later';
  scheduledFor: Date | null;
}

/** Grace window so a time chosen a moment ago doesn't fail the "future" check. */
const SCHEDULE_GRACE_MS = 60_000;

export type QuotePhase = 'contact' | 'full';

/**
 * Returns the first validation error for the given phase, or `null` if valid.
 * `contact` validates the fields collected on step 1 (location, phone, schedule);
 * `full` additionally requires a chosen service, and a drop-off address for any
 * service that involves moving the vehicle.
 */
export function validateQuote(data: QuoteData, phase: QuotePhase): string | null {
  if (!data.location.trim()) return 'Please enter a pickup location.';

  if (data.phone.replace(/\D/g, '').length < 7) {
    return 'Please enter a valid phone number.';
  }

  if (data.timing === 'later') {
    if (!data.scheduledFor) return 'Please pick a date and time for your booking.';
    if (data.scheduledFor.getTime() < Date.now() - SCHEDULE_GRACE_MS) {
      return 'Scheduled time must be in the future.';
    }
  }

  if (phase === 'full' && !data.service) {
    return 'Please choose what you need help with.';
  }

  // A tow needs somewhere to go. Without this the job reaches the operator with
  // a blank destination and no price, so it can neither be quoted nor driven.
  if (phase === 'full' && serviceNeedsDestination(data.service) && !data.destination.trim()) {
    return 'Please enter a drop-off address.';
  }

  return null;
}
