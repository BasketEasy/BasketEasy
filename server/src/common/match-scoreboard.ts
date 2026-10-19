import type { EventVenue } from '@basketeasy/types/events';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import type { MatchPeriodScore, MatchScoreboard } from '@basketeasy/types/team-stats';

/**
 * The sheet names its sides `home` (Équipe A, the receiving team) and `away`;
 * the app speaks in « nous » and « eux ». The event's venue says which is
 * which, the same resolution `deriveMatchResult` and the stat fold use.
 */
export function ourSideFor(venue: EventVenue): 'home' | 'away' {
  return venue === 'HOME' ? 'home' : 'away';
}

/**
 * A confirmed sheet's score and periods from our side's point of view. Null
 * when there is no parsed data or the venue is unknown, never a guess.
 */
export function toScoreboard(
  venue: EventVenue | null,
  data: ParsedScoresheetData | null,
): MatchScoreboard | null {
  if (!venue || !data) {
    return null;
  }
  const ours = ourSideFor(venue);
  const theirs = ours === 'home' ? 'away' : 'home';
  return {
    ourScore: ours === 'home' ? data.homeScore : data.awayScore,
    theirScore: theirs === 'home' ? data.homeScore : data.awayScore,
    periods: data.quarterScores.map((quarter) => ({
      ours: quarter[ours],
      theirs: quarter[theirs],
    })),
  };
}

/**
 * Writes a manual score onto the sheet's parsed data and nothing else: the
 * players and scoring plays stay the verbatim read (the typed `MatchPlayerStat`
 * rows carry the manager's per-player corrections). With no parsed data at all
 * (a match entered with no sheet) the rest starts empty.
 */
export function applyScoreboard(
  venue: EventVenue,
  base: ParsedScoresheetData | null,
  score: { ourScore: number; theirScore: number; periods: MatchPeriodScore[] },
): ParsedScoresheetData {
  const ours = ourSideFor(venue);
  const homeFirst = ours === 'home';
  return {
    players: base?.players ?? [],
    scoringPlays: base?.scoringPlays ?? [],
    homeScore: homeFirst ? score.ourScore : score.theirScore,
    awayScore: homeFirst ? score.theirScore : score.ourScore,
    quarterScores: score.periods.map((period) => ({
      home: homeFirst ? period.ours : period.theirs,
      away: homeFirst ? period.theirs : period.ours,
    })),
  };
}
