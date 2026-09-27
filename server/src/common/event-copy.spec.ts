import { describeEvent, formatEventMoment } from './event-copy';

// 20:30 Paris time in January (UTC+1). Formatting in UTC would render this as
// 19:30 for every French reader, which is the bug this module exists to avoid.
const WINTER_EVENING = new Date('2026-01-10T19:30:00.000Z');
// 20:30 Paris time in July (UTC+2) — the same wall clock, a different offset.
const SUMMER_EVENING = new Date('2026-07-11T18:30:00.000Z');

describe('event copy', () => {
  describe('formatEventMoment', () => {
    it('renders the local Paris wall-clock time, not UTC', () => {
      expect(formatEventMoment(WINTER_EVENING)).toBe('samedi 10 janvier à 20:30');
    });

    it('follows the DST offset across the year', () => {
      expect(formatEventMoment(SUMMER_EVENING)).toBe('samedi 11 juillet à 20:30');
    });
  });

  describe('describeEvent', () => {
    it('names the opponent for a match', () => {
      expect(describeEvent({ type: 'MATCH', opponentName: 'ASVEL' })).toBe('le match contre ASVEL');
    });

    it('falls back to a bare match when no opponent is recorded', () => {
      expect(describeEvent({ type: 'MATCH', opponentName: null })).toBe('le match');
    });

    it('never names an opponent for a training', () => {
      expect(describeEvent({ type: 'TRAINING', opponentName: null })).toBe('l’entraînement');
    });
  });
});
