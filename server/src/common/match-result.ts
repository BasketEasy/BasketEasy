import type { EventVenue } from '@basketeasy/types/events';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import type { EventMatchResult } from '@basketeasy/types/events';

/**
 * Projects a MATCH's final score onto the event, from its venue and the
 * *confirmed* scoresheet's parsed data — the same `venue → home/away`
 * resolution `ScoresheetsService.ourSideOf`/`MatchPlayerStat` writing already
 * use. Never invents a score: a null venue, missing/partial parsedData, or a
 * confirmed sheet whose own homeScore/awayScore is somehow still null all
 * resolve to `null` rather than a guessed result. Callers are responsible for
 * only calling this with a *confirmed* extraction's data — this function has
 * no way to check that itself.
 */
export function deriveMatchResult(
  venue: EventVenue | null,
  parsedData: ParsedScoresheetData | null,
): EventMatchResult | null {
  if (!venue || !parsedData || parsedData.homeScore === null || parsedData.awayScore === null) {
    return null;
  }
  const ourScore = venue === 'HOME' ? parsedData.homeScore : parsedData.awayScore;
  const theirScore = venue === 'HOME' ? parsedData.awayScore : parsedData.homeScore;
  const outcome = ourScore > theirScore ? 'WIN' : ourScore < theirScore ? 'LOSS' : 'DRAW';
  return { ourScore, theirScore, outcome };
}
