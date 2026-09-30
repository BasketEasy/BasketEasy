import { shareRequestedNotification } from './whatsapp-notification-copy';

describe('shareRequestedNotification', () => {
  const match = {
    type: 'MATCH' as const,
    // 20:30 in Paris on Saturday 4 October 2026 (CEST)
    startsAt: new Date('2026-10-04T18:30:00Z'),
    opponentName: 'ES Vertou',
  };

  it('asks to share a match in Paris time', () => {
    expect(shareRequestedNotification(match, false)).toEqual({
      title: 'Rappel à partager : Match contre ES Vertou, dim. 4 oct.',
      body: 'Partagez le message dans le groupe WhatsApp de l’équipe.',
    });
  });

  it('says « Toujours pas partagé » for the nudge', () => {
    const { title, body } = shareRequestedNotification(
      { type: 'TRAINING', startsAt: match.startsAt, opponentName: null },
      true,
    );
    expect(title).toBe('Toujours pas partagé : Entraînement, dim. 4 oct.');
    expect(body).toContain('Personne n’a encore partagé');
  });
});
