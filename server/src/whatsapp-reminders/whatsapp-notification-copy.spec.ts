import {
  changeRequestedNotification,
  describeShareSubject,
  shareRequestedNotification,
} from './whatsapp-notification-copy';

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

describe('changeRequestedNotification', () => {
  it('names a single change or cancellation', () => {
    expect(
      changeRequestedNotification('UPDATE', ['Match contre X, sam. 4 oct.'], false).title,
    ).toBe('Changement à partager : Match contre X, sam. 4 oct.');
    expect(
      changeRequestedNotification('CANCELLATION', ['Entraînement, mer. 1 oct.'], false).title,
    ).toBe('Annulation à partager : Entraînement, mer. 1 oct.');
  });

  it('counts several rather than naming each, for a series', () => {
    expect(changeRequestedNotification('UPDATE', ['a', 'b', 'c'], false).title).toBe(
      '3 changements à partager',
    );
    expect(changeRequestedNotification('CANCELLATION', ['a', 'b'], false).title).toBe(
      '2 annulations à partager',
    );
  });

  it('prefixes the nudge and says nobody shared', () => {
    const { title, body } = changeRequestedNotification('UPDATE', ['a'], true);
    expect(title).toBe('Toujours pas partagé : Changement à partager : a');
    expect(body).toContain('Personne n’a encore partagé');
  });

  it('describes a subject the way the reminder does', () => {
    expect(
      describeShareSubject({
        type: 'MATCH',
        startsAt: new Date('2026-10-04T18:30:00Z'),
        opponentName: 'ES Vertou',
      }),
    ).toBe('Match contre ES Vertou, dim. 4 oct.');
  });
});
