import type { EventRsvpRespondent } from '@basketeasy/types/events';

/**
 * Who gave an RSVP answer, as the reader sees it: first name and last
 * initial (« Sophie M. »), never the full last name and never a relationship
 * label (design decision 14). Null when the author is unknown — an answer
 * that predates the column, or whose author's account was erased.
 */
export function toRsvpRespondent(
  user: { id: string; firstName: string | null; lastName: string | null } | null,
  callerId: string,
): EventRsvpRespondent | null {
  if (!user) return null;
  return {
    firstName: user.firstName,
    lastInitial: user.lastName ? user.lastName.charAt(0).toUpperCase() : null,
    isMe: user.id === callerId,
  };
}

/** The `select` every RSVP read adds to report its author. */
export const RSVP_RESPONDENT_SELECT = {
  select: { id: true, firstName: true, lastName: true },
} as const;
