import { describe, expect, it } from 'vitest';
import type { ScoresheetValidationIssue } from '@basketeasy/types/scoresheet-extraction';
import { describeScoresheetIssue } from './scoresheetIssueCopy';

const labels = { home: 'Mon équipe', away: 'Nantes Sully' };
const issue = (overrides: Partial<ScoresheetValidationIssue>): ScoresheetValidationIssue => ({
  code: 'QUARTERS_DONT_SUM',
  severity: 'error',
  side: 'home',
  runningScore: null,
  jerseyNumber: null,
  period: null,
  ...overrides,
});

describe('describeScoresheetIssue', () => {
  it('names the side the way the card does', () => {
    expect(describeScoresheetIssue(issue({ side: 'away' }), labels)).toBe(
      'Nantes Sully : les quart-temps ne font pas le score final.',
    );
  });

  it('points at the basket and the number for a scorer off the roster', () => {
    expect(
      describeScoresheetIssue(
        issue({ code: 'SCORER_NOT_ON_ROSTER', runningScore: 42, jerseyNumber: 99 }),
        labels,
      ),
    ).toBe('Mon équipe : le n°99 marque le panier à 42 mais n’est pas sur la liste des joueurs.');
  });

  it('names quarters and overtime periods', () => {
    const end = (period: number) =>
      describeScoresheetIssue(
        issue({ code: 'PERIOD_END_NOT_MARKED', period, runningScore: 30 }),
        labels,
      );
    expect(end(1)).toBe(
      'Mon équipe : le total de fin du 1er quart-temps (30) n\u2019apparaît pas dans la marque courante.',
    );
    expect(end(3)).toContain('de fin du 3e quart-temps (30)');
    expect(end(5)).toContain('de fin de la prolongation 1 (30)');
  });

  it('reads without a total when the basket has none', () => {
    expect(describeScoresheetIssue(issue({ code: 'UNREAD_SCORER' }), labels)).toBe(
      'Mon équipe : le numéro du marqueur d’un panier n’a pas été lu.',
    );
  });
});
