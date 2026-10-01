import type { EventType } from '@prisma/client';
import type { Gender } from '@basketeasy/types/teams';
import { describeEvent, formatWeekdayShortDate } from '../common/event-copy';
import {
  SELF_SUBJECT,
  jerseyDutyHolderSentence,
  type NotificationSubject,
} from '../common/notification-subject';

// Copy for the jersey wash rotation (design decisions 12, F3, F4). Dates are
// Europe/Paris (common/event-copy.ts); the reader's phrasing goes through
// common/notification-subject.ts like every other player-facing copy.

interface MatchFacts {
  startsAt: Date;
  opponentName: string | null;
}

/** A player as a sentence names them: « Inès B. », with the pronoun that agrees with them. */
export interface NamedPlayer {
  /** First name + last initial, never a relationship label. */
  displayName: string;
  gender: Gender;
}

/** « Inès B. » */
export function displayName(player: { firstName: string; lastName: string }): string {
  const initial = player.lastName.trim().charAt(0).toUpperCase();
  return initial ? `${player.firstName} ${initial}.` : player.firstName;
}

const TITLE = 'Lavage des maillots';

// « samedi 4 oct. » already ends with its abbreviation dot: no second one.
const endSentence = (text: string) => (text.endsWith('.') ? text : `${text}.`);

const matchPhrase = (event: MatchFacts) => describeEvent({ type: 'MATCH' as EventType, ...event });

/** A manager or the freeze job gave the reader (or their child) the duty. */
export function jerseyDutyAssignedNotification(
  event: MatchFacts,
  subject: NotificationSubject = SELF_SUBJECT,
): { title: string; body: string } {
  return {
    title: TITLE,
    body: endSentence(
      `${jerseyDutyHolderSentence(subject)} les maillots après ${matchPhrase(event)} ${formatWeekdayShortDate(event.startsAt)}`,
    ),
  };
}

/** Told to the previous holder: the swap they proposed was accepted. */
export function jerseySwapAcceptedNotification(
  event: MatchFacts,
  accepter: NamedPlayer,
  subject: NotificationSubject = SELF_SUBJECT,
): { title: string; body: string } {
  const pronoun = accepter.gender === 'WOMEN' ? 'Elle' : 'Il';
  const accepted =
    subject.children.length === 0
      ? `${accepter.displayName} a accepté votre échange.`
      : `${accepter.displayName} a accepté l’échange proposé pour ${subject.children.map((c) => c.firstName).join(' et ')}.`;
  return {
    title: TITLE,
    body: `${accepted} ${pronoun} lave les maillots après ${matchPhrase(event)}.`,
  };
}

/** Told to the target: someone asks them to take the duty in their place. */
export function jerseySwapRequestedNotification(
  event: MatchFacts,
  proposer: NamedPlayer,
  subject: NotificationSubject = SELF_SUBJECT,
): { title: string; body: string } {
  const to =
    subject.children.length === 0
      ? 'vous propose'
      : `propose à ${subject.children.map((c) => c.firstName).join(' et ')}`;
  return {
    title: 'Échange proposé',
    body: endSentence(
      `${proposer.displayName} ${to} de laver les maillots à sa place après ${matchPhrase(event)} ${formatWeekdayShortDate(event.startsAt)}`,
    ),
  };
}
