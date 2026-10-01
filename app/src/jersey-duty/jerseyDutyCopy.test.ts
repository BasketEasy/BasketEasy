import { describe, expect, it } from 'vitest';
import {
  acceptLabel,
  acceptedLine,
  declineLabel,
  dutyPersonName,
  emptyPoolBody,
  holderStatus,
  poolSummary,
  suggestionMeta,
  swapFootnote,
  swapIntro,
  turnTitle,
  withdrawLabel,
} from './jerseyDutyCopy';

describe('jerseyDutyCopy', () => {
  it('names a person « Prénom N. »', () => {
    expect(dutyPersonName({ firstName: 'Emma', lastName: 'moreau' })).toBe('Emma M.');
  });

  it('agrees the collective nouns with the team and quotes the real RSVP label', () => {
    expect(emptyPoolBody('WOMEN')).toBe(
      'Elle apparaîtra dès qu’une joueuse convoquée aura répondu « Présent ».',
    );
    expect(emptyPoolBody('MEN')).toBe(
      'Elle apparaîtra dès qu’un joueur convoqué aura répondu « Présent ».',
    );
    expect(poolSummary({ convokedGoingCount: 8, exemptedCount: 1 }, 'WOMEN')).toBe(
      'Parmi 8 joueuses convoquées et présentes, 1 exemptée.',
    );
    expect(poolSummary({ convokedGoingCount: 1, exemptedCount: 0 }, 'MEN')).toBe(
      'Parmi 1 joueur convoqué et présent.',
    );
    expect(swapIntro('WOMEN', null)).toContain('Seules les joueuses convoquées et présentes');
    expect(swapIntro('MEN', 'Léo')).toBe(
      'À qui proposer de laver les maillots à la place de Léo ? Seules les joueurs convoqués et présents apparaissent.',
    );
  });

  it('agrees pronouns with the person, falling back on the team', () => {
    expect(declineLabel(null, 'MEN', 'WOMEN')).toBe('Je ne peux pas');
    expect(declineLabel('Léo', 'MEN', 'MEN')).toBe('Il ne peut pas');
    expect(declineLabel('Emma', null, 'WOMEN')).toBe('Elle ne peut pas');
    expect(declineLabel('Emma', 'MEN', 'WOMEN')).toBe('Il ne peut pas');
    expect(withdrawLabel('Léo', null, 'MEN')).toBe('Il ne peut plus');
    expect(withdrawLabel(null, null, 'MEN')).toBe('Je ne peux plus');
    expect(swapFootnote('WOMEN', null)).toBe(
      'Vous restez responsable tant qu’elle n’a pas accepté.',
    );
    expect(swapFootnote('MEN', 'Léo')).toBe('Léo reste responsable tant qu’il n’a pas accepté.');
  });

  it('speaks to the reader or names the child', () => {
    expect(turnTitle(null)).toBe('C’est votre tour');
    expect(turnTitle('Léo')).toBe('Au tour de Léo');
    expect(acceptLabel('Léo')).toBe('C’est noté pour Léo');
    expect(suggestionMeta(1, true)).toBe('1 lavage cette saison, le moins de l’équipe.');
    expect(suggestionMeta(2, false)).toBe('2 lavages cette saison.');
  });

  it('says who accepted', () => {
    const sophie = { firstName: 'Sophie', lastInitial: 'M', isMe: false };
    expect(acceptedLine({ ...sophie, isMe: true }, null)).toBe(
      'Vous rapportez le sac propre au prochain match.',
    );
    expect(acceptedLine(sophie, 'Léo')).toBe('Accepté par Sophie M.');
    expect(acceptedLine({ ...sophie, isMe: true }, 'Léo')).toBe('Accepté par vous');
  });

  it('reads the holder row by status', () => {
    expect(holderStatus('ASSIGNED', true, '11 oct.')).toEqual({
      description: 'Ramène le sac au match du 11 oct.',
      badge: 'En cours',
      tone: 'structure',
    });
    expect(holderStatus('DONE', true, null).badge).toBe('Fait');
    expect(holderStatus('VOIDED', true, null).badge).toBe('Annulé');
    expect(holderStatus('ACCEPTED', false, null).badge).toBe('Noté');
  });
});
