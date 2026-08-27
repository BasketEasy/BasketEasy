import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatVoteWindowEnd,
  hasVoteWindowClosed,
  isVoteWindowOpen,
  voteWindowDaysRemaining,
} from './voteWindow';

describe('formatVoteWindowEnd', () => {
  it('formats the window close (startsAt + 5 days) as day/month plus a fixed end-of-day time', () => {
    expect(formatVoteWindowEnd('2026-08-30T18:00:00.000Z')).toBe('4 sept. 23h59');
  });
});

describe('isVoteWindowOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is false within the first hour after kickoff', () => {
    vi.setSystemTime(new Date('2026-08-30T18:30:00.000Z'));
    expect(isVoteWindowOpen('2026-08-30T18:00:00.000Z')).toBe(false);
  });

  it('is true once an hour has passed since kickoff', () => {
    vi.setSystemTime(new Date('2026-08-30T19:00:00.000Z'));
    expect(isVoteWindowOpen('2026-08-30T18:00:00.000Z')).toBe(true);
  });

  it('is false once 5 days have passed since kickoff', () => {
    vi.setSystemTime(new Date('2026-09-04T18:00:01.000Z'));
    expect(isVoteWindowOpen('2026-08-30T18:00:00.000Z')).toBe(false);
  });
});

describe('hasVoteWindowClosed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is false while the window is still open', () => {
    vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
    expect(hasVoteWindowClosed('2026-08-30T18:00:00.000Z')).toBe(false);
  });

  it('is true once 5 days have passed since kickoff', () => {
    vi.setSystemTime(new Date('2026-09-04T18:00:01.000Z'));
    expect(hasVoteWindowClosed('2026-08-30T18:00:00.000Z')).toBe(true);
  });
});

describe('voteWindowDaysRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null before the window opens (within the first hour)', () => {
    vi.setSystemTime(new Date('2026-08-30T18:30:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBeNull();
  });

  it('returns the number of days remaining within the window', () => {
    vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBe(4);
  });

  it('returns null once the window has closed', () => {
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    expect(voteWindowDaysRemaining('2026-08-30T18:00:00.000Z')).toBeNull();
  });
});
