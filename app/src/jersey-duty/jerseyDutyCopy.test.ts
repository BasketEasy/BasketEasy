import { describe, expect, it } from 'vitest';
import {
  acceptLabel,
  acceptedLine,
  declineLabel,
  dutyPersonName,
  emptyPoolBody,
  emptyRosterTitle,
  exemptLabel,
  exemptionToast,
  holderStatus,
  lastTurnLine,
  nextMatchLine,
  poolSummary,
  rosterColumnLabel,
  seasonLabel,
  suggestionMeta,
  swapFootnote,
  swapIntro,
  turnTitle,
  turnsAndLastLine,
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

describe('team page copy', () => {
  it('gendered words follow the team', () => {
    expect(rosterColumnLabel('WOMEN')).toBe('Joueuse');
    expect(rosterColumnLabel('MEN')).toBe('Joueur');
    expect(exemptLabel('WOMEN')).toBe('Exemptée');
    expect(exemptLabel('MEN')).toBe('Exempté');
    expect(emptyRosterTitle('WOMEN')).toBe('Aucune joueuse dans l’effectif.');
    expect(emptyRosterTitle('MEN')).toBe('Aucun joueur dans l’effectif.');
  });

  it('labels the season and the meta lines', () => {
    expect(seasonLabel(2026)).toBe('Saison 2026-2027');
    expect(lastTurnLine('27 sept.')).toBe('Dernier : 27 sept.');
    expect(lastTurnLine(null)).toBe('Dernier : —');
    expect(turnsAndLastLine(0, null)).toBe('0 lavage · —');
    expect(turnsAndLastLine(1, '27 sept.')).toBe('1 lavage · 27 sept.');
    expect(turnsAndLastLine(2, '6 sept.')).toBe('2 lavages · 6 sept.');
  });

  it('words the exemption toasts', () => {
    expect(exemptionToast('Emma M.', true, 'WOMEN')).toBe('Emma M. est exemptée.');
    expect(exemptionToast('Emma M.', false, 'WOMEN')).toBe('Emma M. n’est plus exemptée.');
    expect(exemptionToast('Hugo M.', true, 'MEN')).toBe('Hugo M. est exempté.');
  });

  it('words the next-match tile', () => {
    const emma = { firstName: 'Emma', lastName: 'Martin' };
    expect(nextMatchLine({ holder: emma, suggestion: null })).toBe('Lavage : Emma M.');
    expect(nextMatchLine({ holder: null, suggestion: emma })).toBe('Suggestion : Emma M.');
    expect(nextMatchLine({ holder: null, suggestion: null })).toBe(
      'Aucune suggestion pour l’instant',
    );
  });
});
