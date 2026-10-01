import {
  displayName,
  jerseyDutyAssignedNotification,
  jerseySwapAcceptedNotification,
  jerseySwapRequestedNotification,
} from './jersey-duty-notification-copy';

const MATCH = { startsAt: new Date('2025-10-04T18:00:00.000Z'), opponentName: 'BC Rezé' };
const PARENT = { self: false, children: [{ firstName: 'Léo' }] };
const SELF = { self: true, children: [] };

describe('jersey duty notification copy', () => {
  it('names a player by first name and last initial', () => {
    expect(displayName({ firstName: 'Inès', lastName: 'bernard' })).toBe('Inès B.');
    expect(displayName({ firstName: 'Inès', lastName: '' })).toBe('Inès');
  });

  describe('assigned', () => {
    it('speaks to the player', () => {
      expect(jerseyDutyAssignedNotification(MATCH, SELF)).toEqual({
        title: 'Lavage des maillots',
        body: 'Vous lavez les maillots après le match contre BC Rezé samedi 4 oct.',
      });
    });

    it('names the child to a guardian', () => {
      expect(
        jerseyDutyAssignedNotification({ ...MATCH, opponentName: 'ASPTT Nantes' }, PARENT).body,
      ).toBe('Léo lave les maillots après le match contre ASPTT Nantes samedi 4 oct.');
    });

    it('formats the date in Europe/Paris across a DST change', () => {
      // Summer time ends on Sunday 25 Oct 2026. 22:30 UTC on the 24th is
      // already Sunday in Paris (CEST, +2), and 23:30 UTC on the 25th is
      // already Monday (CET, +1).
      const summer = { ...MATCH, startsAt: new Date('2026-10-24T22:30:00.000Z') };
      expect(jerseyDutyAssignedNotification(summer, SELF).body).toContain('dimanche 25 oct.');
      const late = { ...MATCH, startsAt: new Date('2026-10-25T23:30:00.000Z') };
      expect(jerseyDutyAssignedNotification(late, SELF).body).toContain('lundi 26 oct.');
      const winter = { ...MATCH, startsAt: new Date('2026-10-31T23:30:00.000Z') };
      expect(jerseyDutyAssignedNotification(winter, SELF).body).toContain('dimanche 1 nov.');
    });
  });

  describe('swap accepted', () => {
    it.each([
      ['WOMEN' as const, 'Elle'],
      ['MEN' as const, 'Il'],
    ])('agrees with a %s accepter', (gender, pronoun) => {
      expect(
        jerseySwapAcceptedNotification(MATCH, { displayName: 'Inès B.', gender }, SELF),
      ).toEqual({
        title: 'Lavage des maillots',
        body: `Inès B. a accepté votre échange. ${pronoun} lave les maillots après le match contre BC Rezé.`,
      });
    });

    it('names the child to a guardian', () => {
      expect(
        jerseySwapAcceptedNotification(MATCH, { displayName: 'Inès B.', gender: 'WOMEN' }, PARENT)
          .body,
      ).toBe(
        'Inès B. a accepté l’échange proposé pour Léo. Elle lave les maillots après le match contre BC Rezé.',
      );
    });
  });

  describe('swap requested', () => {
    it('speaks to the target', () => {
      expect(
        jerseySwapRequestedNotification(MATCH, { displayName: 'Emma M.', gender: 'WOMEN' }, SELF),
      ).toEqual({
        title: 'Échange proposé',
        body: 'Emma M. vous propose de laver les maillots à sa place après le match contre BC Rezé samedi 4 oct.',
      });
    });

    it('names the child to a guardian', () => {
      expect(
        jerseySwapRequestedNotification(MATCH, { displayName: 'Emma M.', gender: 'WOMEN' }, PARENT)
          .body,
      ).toBe(
        'Emma M. propose à Léo de laver les maillots à sa place après le match contre BC Rezé samedi 4 oct.',
      );
    });
  });
});
