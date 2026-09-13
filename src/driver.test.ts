import { describe, expect, it } from 'vitest';
import { whenLabel, diffJobs, type Job } from './driver';

describe('whenLabel', () => {
  it('says ASAP for a job wanted now', () => {
    expect(whenLabel({ timing: 'now', scheduledFor: null })).toBe('ASAP');
  });

  it('shows the booked day and time for a scheduled job', () => {
    const at = new Date(2026, 8, 14, 9, 30);
    const label = whenLabel({ timing: 'later', scheduledFor: at.toISOString() });
    expect(label).toContain('14');
    expect(label).toContain('09:30');
  });

  it('still flags a scheduled job whose time is missing', () => {
    expect(whenLabel({ timing: 'later', scheduledFor: null })).toBe('Scheduled · time not given');
  });
});

const job = (over: Partial<Job>): Job => ({
  id: 1,
  region: 'Manchester',
  location: 'M1 1AA',
  destination: null,
  phone: '07700 900123',
  service: 'towing',
  timing: 'now',
  scheduledFor: null,
  vehicle: null,
  pickupLat: null,
  pickupLng: null,
  motorway: false,
  distanceMiles: null,
  durationMinutes: null,
  price: null,
  driverId: null,
  driverName: null,
  status: 'pending',
  trackToken: null,
  createdAt: '2026-09-13T10:00:00Z',
  acceptedAt: null,
  enRouteAt: null,
  onSceneAt: null,
  finishedAt: null,
  cancelledBy: null,
  rating: null,
  ratingComment: null,
  ...over,
});

describe('diffJobs', () => {
  it('is silent on the first load, so an old backlog does not buzz the phone', () => {
    expect(diffJobs(null, [job({ id: 1 })], 5)).toEqual({ newWaiting: [], cancelledOnMe: [] });
  });

  it('spots a job that appeared since the last poll', () => {
    const before = [job({ id: 1 })];
    const after = [job({ id: 1 }), job({ id: 2 })];
    expect(diffJobs(before, after, 5).newWaiting.map((j) => j.id)).toEqual([2]);
  });

  it('does not count a new job someone else already took', () => {
    const after = [job({ id: 2, status: 'accepted', driverId: 9 })];
    expect(diffJobs([], after, 5).newWaiting).toEqual([]);
  });

  it('spots the customer cancelling a job this driver is on', () => {
    const before = [job({ id: 3, status: 'en_route', driverId: 5 })];
    const after = [job({ id: 3, status: 'cancelled', driverId: 5, cancelledBy: 'customer' })];
    expect(diffJobs(before, after, 5).cancelledOnMe.map((j) => j.id)).toEqual([3]);
  });

  it("ignores cancellations of other drivers' jobs and driver-side cancellations", () => {
    const before = [
      job({ id: 3, status: 'en_route', driverId: 9 }),
      job({ id: 4, status: 'accepted', driverId: 5 }),
    ];
    const after = [
      job({ id: 3, status: 'cancelled', driverId: 9, cancelledBy: 'customer' }),
      job({ id: 4, status: 'cancelled', driverId: 5, cancelledBy: 'driver' }),
    ];
    expect(diffJobs(before, after, 5).cancelledOnMe).toEqual([]);
  });
});
