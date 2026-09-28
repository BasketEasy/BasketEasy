import { rangeWindow, ratio } from './platform-admin-stats.service';

// The aggregate queries themselves are SQL and Prisma filters: they were run
// against a real Postgres (seeded CTC team, guardian answer, stale route)
// while this was written. What is pure is pinned down here.

describe('platform-admin stats helpers', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('ends every range now', () => {
    expect(rangeWindow('7d', now, null)).toEqual({
      from: new Date('2026-09-21T12:00:00Z'),
      to: now,
    });
    expect(rangeWindow('90d', now, null).from).toEqual(new Date('2026-06-30T12:00:00Z'));
  });

  it('starts the season on 1 September, the FFBB way', () => {
    expect(rangeWindow('season', now, null).from).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(rangeWindow('season', new Date('2026-08-15T00:00:00Z'), null).from).toEqual(
      new Date('2025-09-01T00:00:00Z'),
    );
  });

  it('starts « all » at the first club, or now on an empty platform', () => {
    const first = new Date('2024-09-04T10:00:00Z');
    expect(rangeWindow('all', now, first).from).toBe(first);
    expect(rangeWindow('all', now, null).from).toBe(now);
  });

  it('never turns nothing-to-divide-by into 0 %', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(0, 4)).toBe(0);
    expect(ratio(1, 4)).toBe(0.25);
  });
});
