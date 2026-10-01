import { seasonWindow, seasonYearFor } from './season';

describe('seasonYearFor', () => {
  // A French basketball season runs September to August, so the boundary is
  // the one thing worth pinning down: 31 August still belongs to the season
  // that started the previous September.
  it.each([
    ['2026-08-31T23:59:59.999Z', 2025],
    ['2026-09-01T00:00:00.000Z', 2026],
    ['2027-01-15T12:00:00.000Z', 2026],
    ['2027-08-31T23:59:59.999Z', 2026],
    ['2027-09-01T00:00:00.000Z', 2027],
  ])('places %s in season %i', (iso, expected) => {
    expect(seasonYearFor(new Date(iso))).toBe(expected);
  });
});

describe('seasonWindow', () => {
  it('spans 1 September to the last millisecond of 31 August', () => {
    const { start, end } = seasonWindow(2026);

    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-08-31T23:59:59.999Z');
  });
});
