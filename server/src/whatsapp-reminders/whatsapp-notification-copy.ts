import type { EventType } from '@prisma/client';
import { formatShortDate, titleEvent } from '../common/event-copy';

// Dates are formatted in Europe/Paris — see common/event-copy.ts.

/** What an event is called in a sentence: « Match contre X, sam. 4 oct. ». */
export function describeShareSubject(event: {
  type: EventType;
  startsAt: Date;
  opponentName: string | null;
}): string {
  return `${titleEvent(event)}, ${formatShortDate(event.startsAt)}`;
}

/** The reminder a manager is asked to share, or the nudge an hour later. */
export function shareRequestedNotification(
  event: { type: EventType; startsAt: Date; opponentName: string | null },
  isNudge: boolean,
): { title: string; body: string } {
  const what = describeShareSubject(event);
  return {
    title: isNudge ? `Toujours pas partagé : ${what}` : `Rappel à partager : ${what}`,
    body: isNudge
      ? 'Personne n’a encore partagé le message dans le groupe WhatsApp de l’équipe.'
      : 'Partagez le message dans le groupe WhatsApp de l’équipe.',
  };
}

/**
 * One notification per manager for a whole call, however many occurrences it
 * covered (a series edit or delete): a single subject is named, several are
 * counted. `subjects` are already-rendered `describeShareSubject` strings.
 */
export function changeRequestedNotification(
  kind: 'UPDATE' | 'CANCELLATION',
  subjects: string[],
  isNudge: boolean,
): { title: string; body: string } {
  const isUpdate = kind === 'UPDATE';
  const head =
    subjects.length === 1
      ? `${isUpdate ? 'Changement' : 'Annulation'} à partager : ${subjects[0]}`
      : `${subjects.length} ${isUpdate ? 'changements' : 'annulations'} à partager`;
  const body = isUpdate
    ? 'Le groupe WhatsApp a déjà reçu le message : partagez la mise à jour.'
    : 'Le groupe WhatsApp a déjà reçu le message : annoncez l’annulation.';
  return {
    title: isNudge ? `Toujours pas partagé : ${head}` : head,
    body: isNudge
      ? 'Personne n’a encore partagé le message dans le groupe WhatsApp de l’équipe.'
      : body,
  };
}
