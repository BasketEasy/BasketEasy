import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatVoteWindowEnd, voteWindowDaysRemaining } from './voteWindow';

describe('formatVoteWindowEnd', () => {
  it('formats the window end (startsAt + 7 days) as day/month plus a fixed end-of-day time', () => {
    expect(formatVoteWindowEnd('2026-08-30T18:00:00.000Z')).toBe('6 sept. 23h59');
  });
});

describe('voteWindowDaysRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when the match has not started yet', () => {
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBeNull();
  });

  it('returns the number of days remaining within the window', () => {
    vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBe(6);
  });

  it('returns null once the window has closed', () => {
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBeNull();
  });
});
