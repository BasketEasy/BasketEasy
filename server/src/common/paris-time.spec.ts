import { endOfParisDay } from './paris-time';

describe('endOfParisDay', () => {
  it('ends a summer day at 22:00Z (UTC+2)', () => {
    expect(endOfParisDay(new Date('2026-06-13T00:00:00Z')).toISOString()).toBe(
      '2026-06-13T22:00:00.000Z',
    );
  });

  it('ends a winter day at 23:00Z (UTC+1)', () => {
    expect(endOfParisDay(new Date('2026-12-13T00:00:00Z')).toISOString()).toBe(
      '2026-12-13T23:00:00.000Z',
    );
  });

  it('uses the Paris day, not the UTC day, for a late evening instant', () => {
    // 23:30Z on 13 June is 01:30 on the 14th in Paris.
    expect(endOfParisDay(new Date('2026-06-13T23:30:00Z')).toISOString()).toBe(
      '2026-06-14T22:00:00.000Z',
    );
  });

  it('handles the spring-forward day (23 h long)', () => {
    expect(endOfParisDay(new Date('2027-03-28T00:00:00Z')).toISOString()).toBe(
      '2027-03-28T22:00:00.000Z',
    );
  });
});
