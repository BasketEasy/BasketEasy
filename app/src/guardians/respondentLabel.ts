import type { EventRsvpRespondent } from '@basketeasy/types/events';

/** « Sophie M. », never the full last name (design decision 14). */
export function respondentName(respondent: EventRsvpRespondent): string {
  const name = [respondent.firstName, respondent.lastInitial && `${respondent.lastInitial}.`]
    .filter(Boolean)
    .join(' ');
  return name || 'un parent';
}

// « jeu. 19:12 », in the reader's own timezone — it is when *they* saw it.
const RESPONDED_AT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** « Répondu par vous · jeu. 19:12 » / « Répondu par Sophie M. · jeu. 19:12 ». */
export function respondedByLine(
  respondent: EventRsvpRespondent,
  respondedAt: string | null,
): string {
  const who = respondent.isMe ? 'vous' : respondentName(respondent);
  const when = respondedAt ? ` · ${RESPONDED_AT.format(new Date(respondedAt))}` : '';
  return `Répondu par ${who}${when}`;
}
