import { formatNotificationAge } from './notificationTime';

const NOW = new Date('2026-09-04T12:00:00.000Z');

describe('formatNotificationAge', () => {
  it('reads "à l’instant" under a minute', () => {
    expect(formatNotificationAge('2026-09-04T11:59:30.000Z', NOW)).toBe('à l’instant');
  });

  it('counts minutes within the hour', () => {
    expect(formatNotificationAge('2026-09-04T11:48:00.000Z', NOW)).toBe('il y a 12 min');
  });

  it('counts hours within the day', () => {
    expect(formatNotificationAge('2026-09-04T09:00:00.000Z', NOW)).toBe('il y a 3 h');
  });

  it('says "hier" once past a full day but inside two', () => {
    expect(formatNotificationAge('2026-09-03T09:00:00.000Z', NOW)).toBe('hier');
  });

  it('switches to an absolute date once relative stops being useful', () => {
    // "il y a 9 jours" is harder to place than a date, so it stops counting.
    expect(formatNotificationAge('2026-08-26T12:00:00.000Z', NOW)).toBe('26 août');
  });
});
