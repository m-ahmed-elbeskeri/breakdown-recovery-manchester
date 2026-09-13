import { describe, it, expect } from 'vitest';
import { headlineFor, stepIndex, firstName, TRACK_STEPS, type TrackInfo } from './track';

const base: TrackInfo = {
  id: 7,
  status: 'pending',
  service: 'towing',
  timing: 'now',
  scheduledFor: null,
  location: 'M1 1AA',
  destination: 'Bolton',
  vehicle: null,
  pickupLat: 53.48,
  pickupLng: -2.24,
  price: 95,
  motorway: false,
  etaMinutes: 20,
  etaSource: 'driver',
  driversOnDuty: 1,
  driver: null,
  createdAt: '2026-09-13T10:00:00Z',
  acceptedAt: null,
  enRouteAt: null,
  onSceneAt: null,
  finishedAt: null,
  cancelledBy: null,
  rating: null,
  canCancel: true,
};

const dave = {
  name: 'Dave Smith',
  phone: null,
  lat: null,
  lng: null,
  locatedAt: null,
  vehicleReg: null,
  vehicleDescription: null,
  hasPhoto: false,
};

describe('headlineFor', () => {
  it('names the driver by first name once one is assigned', () => {
    expect(headlineFor({ ...base, status: 'accepted', driver: dave })).toBe('Dave has your job');
    expect(headlineFor({ ...base, status: 'en_route', driver: dave })).toBe('Dave is on the way');
  });

  it('copes without a driver record', () => {
    expect(headlineFor({ ...base, status: 'en_route' })).toBe('Driver on the way');
  });

  it('distinguishes a booking for later from a search for a driver now', () => {
    expect(headlineFor(base)).toBe('Finding your driver');
    expect(headlineFor({ ...base, timing: 'later' })).toBe('Booking received');
  });

  it('says who cancelled', () => {
    expect(headlineFor({ ...base, status: 'cancelled', cancelledBy: 'customer' })).toBe(
      'Booking cancelled',
    );
    expect(headlineFor({ ...base, status: 'cancelled', cancelledBy: 'driver' })).toBe(
      'We had to cancel',
    );
  });
});

describe('stepIndex', () => {
  it('walks the steps in order and puts cancelled outside them', () => {
    expect(TRACK_STEPS.map((s) => stepIndex(s.status))).toEqual([0, 1, 2, 3, 4]);
    expect(stepIndex('cancelled')).toBe(-1);
  });
});

describe('firstName', () => {
  it('takes the first word and survives odd input', () => {
    expect(firstName('Dave Smith')).toBe('Dave');
    expect(firstName('  Sam ')).toBe('Sam');
    expect(firstName('')).toBe('');
  });
});
