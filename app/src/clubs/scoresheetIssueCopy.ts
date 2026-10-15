import type { ScoresheetValidationIssue } from '@basketeasy/types/scoresheet-extraction';

/** What each side of the sheet is called on this card (« Mon équipe », the opponent). */
export interface ScoresheetSideLabels {
  home: string;
  away: string;
}

// « de fin du 3e quart-temps », « de fin de la prolongation 1 ».
function periodLabel(period: number): string {
  if (period > 4) return `de la prolongation ${period - 4}`;
  return period === 1 ? 'du 1er quart-temps' : `du ${period}e quart-temps`;
}

function basketLabel(runningScore: number | null): string {
  return runningScore === null ? 'd’un panier' : `du panier à ${runningScore}`;
}

/**
 * One sentence per validator finding, for the manager reviewing the read.
 * The sheet's own vocabulary (marque courante, quart-temps) so it can be
 * checked against the paper without translation.
 */
export function describeScoresheetIssue(
  issue: ScoresheetValidationIssue,
  labels: ScoresheetSideLabels,
): string {
  const team = labels[issue.side];
  const total = issue.runningScore;
  switch (issue.code) {
    case 'QUARTERS_DONT_SUM':
      return `${team} : les quart-temps ne font pas le score final.`;
    case 'FINAL_SCORE_NOT_REACHED':
      return `${team} : la marque courante s’arrête à ${total}, pas au score final.`;
    case 'PLAYS_DONT_SUM':
      return `${team} : les paniers lus ne font pas le score final.`;
    case 'RUNNING_SCORE_NOT_INCREASING':
      return `${team} : le total ${total} est marqué deux fois ou dans le désordre.`;
    case 'IMPOSSIBLE_PLAY':
      return total === null
        ? `${team} : un panier lu ne vaut ni 1, ni 2, ni 3 points.`
        : `${team} : le panier à ${total} vaudrait plus de 3 points, une ligne a sans doute été sautée.`;
    case 'PERIOD_END_NOT_MARKED':
      return `${team} : le total de fin ${periodLabel(issue.period ?? 1)} (${total}) n’apparaît pas dans la marque courante.`;
    case 'UNREAD_SCORER':
      return `${team} : le numéro du marqueur ${basketLabel(total)} n’a pas été lu.`;
    case 'SCORER_NOT_ON_ROSTER':
      return `${team} : le n°${issue.jerseyNumber} marque le panier à ${total} mais n’est pas sur la liste des joueurs.`;
    case 'NOTATION_DISAGREES':
      return `${team} : au panier à ${total}, le signe noté (rond, point) ne correspond pas à l’écart avec le panier précédent.`;
    case 'TOO_MANY_FOULS':
      return `${team} : le n°${issue.jerseyNumber} aurait plus de 5 fautes.`;
  }
}
