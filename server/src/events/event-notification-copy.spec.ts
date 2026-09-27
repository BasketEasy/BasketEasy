import {
  cancellationNotification,
  convocationNotification,
  describeEvent,
  formatEventMoment,
  meetingChangedNotification,
} from './event-notification-copy';

// 20:30 Paris time in January (UTC+1). Formatting in UTC would render this as
// 19:30 for every French reader, which is the bug this module exists to avoid.
const WINTER_EVENING = new Date('2026-01-10T19:30:00.000Z');
// 20:30 Paris time in July (UTC+2) — the same wall clock, a different offset.
const SUMMER_EVENING = new Date('2026-07-11T18:30:00.000Z');

describe('event notification copy', () => {
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

  describe('convocationNotification', () => {
    it('names the team, the fixture, the moment and the venue', () => {
      const copy = convocationNotification('U15 M', {
        type: 'MATCH',
        startsAt: WINTER_EVENING,
        location: 'Gymnase Léo Lagrange',
        opponentName: 'ASVEL',
      });

      expect(copy.title).toBe('Vous êtes convoqué·e — U15 M');
      expect(copy.body).toContain('le match contre ASVEL');
      expect(copy.body).toContain('samedi 10 janvier à 20:30');
      expect(copy.body).toContain('Gymnase Léo Lagrange');
      expect(copy.body).not.toContain('RDV');
    });

    it('adds the meeting point and its Paris time once one is known', () => {
      const copy = convocationNotification(
        'U15 M',
        {
          type: 'MATCH',
          startsAt: WINTER_EVENING,
          location: 'Gymnase Léo Lagrange',
          opponentName: 'ASVEL',
        },
        { meetsAt: new Date('2026-01-10T18:15:00.000Z'), placeName: 'Parking salle Coubertin' },
      );

      expect(copy.body).toContain('RDV à 19:15 — Parking salle Coubertin.');
    });
  });

  describe('meetingChangedNotification', () => {
    it('says what the new meeting is, for which match', () => {
      const copy = meetingChangedNotification(
        'U15 M',
        { type: 'MATCH', startsAt: WINTER_EVENING, opponentName: 'ASVEL' },
        { meetsAt: new Date('2026-01-10T18:00:00.000Z'), placeName: 'Parking Leclerc' },
      );

      expect(copy.title).toBe('RDV modifié — U15 M');
      expect(copy.body).toBe(
        'Nouveau rendez-vous pour le match contre ASVEL du samedi 10 janvier à 20:30 : 19:00 — Parking Leclerc.',
      );
    });
  });

  describe('cancellationNotification', () => {
    it('names the single cancelled fixture', () => {
      const copy = cancellationNotification(
        'U15 M',
        { type: 'MATCH', startsAt: WINTER_EVENING, opponentName: 'ASVEL' },
        1,
      );

      expect(copy.title).toBe('Annulation — U15 M');
      expect(copy.body).toBe('Le match contre ASVEL du samedi 10 janvier à 20:30 a été annulé.');
    });

    it('summarises a series rather than listing every date', () => {
      // A series delete can cover up to MAX_RECURRING_OCCURRENCES (104) rows;
      // naming each one would be worse than saying nothing.
      const copy = cancellationNotification(
        'U15 M',
        { type: 'TRAINING', startsAt: WINTER_EVENING, opponentName: null },
        104,
      );

      expect(copy.title).toBe('104 séances annulées — U15 M');
      expect(copy.body).toContain('104 occurrences');
    });
  });
});
