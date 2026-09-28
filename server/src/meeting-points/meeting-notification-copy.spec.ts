import { meetingChangedNotification, meetingFixedNotification } from './meeting-notification-copy';

// 20:30 Paris time in January (UTC+1).
const WINTER_EVENING = new Date('2026-01-10T19:30:00.000Z');

describe('meeting notification copy', () => {
  describe('meetingFixedNotification', () => {
    it('says « fixé » the first time the hour is known', () => {
      const copy = meetingFixedNotification(
        'U15 M',
        { type: 'MATCH', startsAt: WINTER_EVENING, opponentName: 'ASVEL' },
        { meetsAt: new Date('2026-01-10T18:00:00.000Z'), placeName: 'Parking Leclerc' },
      );

      expect(copy.title).toBe('RDV fixé — U15 M');
      expect(copy.body).toBe(
        'Rendez-vous pour le match contre ASVEL du samedi 10 janvier à 20:30 : 19:00 — Parking Leclerc.',
      );
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
});
