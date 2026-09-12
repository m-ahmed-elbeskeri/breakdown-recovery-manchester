import { describe, expect, it } from 'vitest';
import { whenLabel } from './driver';

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
