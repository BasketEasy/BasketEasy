import type { ReactNode } from 'react';
import type { TeamEvent } from '@basketeasy/types/events';
import { hasVoteWindowClosed, isVoteWindowOpen } from './voteWindow';

/** Each summary comes from the `TeamEvent` the page already holds: a closed item runs no query of its own. */
export function voteSummary(startsAt: string): string | undefined {
  if (hasVoteWindowClosed(startsAt)) return 'Résultats';
  if (isVoteWindowOpen(startsAt)) return 'Vote ouvert';
  return 'Ouvre après le match';
}

export function notesSummary(notes: string): string {
  return notes.split('\n')[0]!;
}

/** « 71 – 64 » once the match has a result, nothing before. */
export function resultSummary(result: TeamEvent['result']): ReactNode {
  if (!result) return undefined;
  return (
    <span className="tabular">
      {result.ourScore} – {result.theirScore}
    </span>
  );
}
