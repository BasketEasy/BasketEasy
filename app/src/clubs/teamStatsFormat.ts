import type { TeamSeasonPlayerStats } from '@basketeasy/types/team-stats';

/**
 * An average with no known value renders as an em dash, never as 0 — a player
 * whose only match had an unreadable running-score column has no measured
 * average, and printing 0 would claim they scored nothing.
 *
 * Shared between `TeamStatsRow` (the squad ranking) and the personal stats
 * card on the same tab (`TeamSeasonStatsTab`) so the null-vs-zero formatting
 * rule is written once.
 */
export function formatAverage(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : String(value);
}

/**
 * Why the bar is empty, which only this function can tell apart: a player who
 * has played but whose points never came back legible is a different thing
 * from one who has not played at all, and a bare empty track would read as the
 * second in both cases. Shared for the same reason as `formatAverage`.
 */
export function emptyRepartitionLabel(player: TeamSeasonPlayerStats): string | null {
  if (player.totalPoints > 0) {
    return null;
  }
  return player.gamesPlayed === 0 ? 'Aucun match' : 'Marque non lue';
}
