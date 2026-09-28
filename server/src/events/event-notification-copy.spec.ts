import { cancellationNotification, convocationNotification } from './event-notification-copy';

// 20:30 Paris time in January (UTC+1). Formatting in UTC would render this as
// 19:30 for every French reader, which is the bug this module exists to avoid.
const WINTER_EVENING = new Date('2026-01-10T19:30:00.000Z');

describe('event notification copy', () => {
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

  describe('for a parent', () => {
    const match = {
      type: 'MATCH' as const,
      startsAt: WINTER_EVENING,
      location: 'Gymnase Léo Lagrange',
      opponentName: 'ASVEL',
    };

    it('names the child instead of the reader', () => {
      const copy = convocationNotification('U11 F', match, null, {
        self: false,
        children: [{ firstName: 'Léo' }],
      });

      expect(copy.title).toBe('Léo est convoqué·e — U11 F');
      expect(copy.body).toMatch(/^Léo est convoqué·e pour le match contre ASVEL/);
      expect(copy.body).toContain('Merci d’indiquer sa présence.');
    });

    it('merges a parent convoked with their child into one sentence', () => {
      const copy = convocationNotification('Seniors', match, null, {
        self: true,
        children: [{ firstName: 'Léo' }],
      });

      expect(copy.title).toBe('Léo et vous êtes convoqué·es — Seniors');
      expect(copy.body).toContain('Merci d’indiquer vos présences.');
    });

    it('says whose match was cancelled', () => {
      const copy = cancellationNotification('U11 F', match, 1, {
        self: false,
        children: [{ firstName: 'Léo' }],
      });

      expect(copy.body).toBe(
        'Pour Léo : Le match contre ASVEL du samedi 10 janvier à 20:30 a été annulé.',
      );
    });
  });
});
