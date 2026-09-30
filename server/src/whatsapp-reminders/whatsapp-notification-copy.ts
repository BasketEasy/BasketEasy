import type { EventType } from '@prisma/client';
import { formatShortDate, titleEvent } from '../common/event-copy';

// Dates are formatted in Europe/Paris — see common/event-copy.ts.

/** The reminder a manager is asked to share, or the nudge an hour later. */
export function shareRequestedNotification(
  event: { type: EventType; startsAt: Date; opponentName: string | null },
  isNudge: boolean,
): { title: string; body: string } {
  const what = `${titleEvent(event)}, ${formatShortDate(event.startsAt)}`;
  return {
    title: isNudge ? `Toujours pas partagé : ${what}` : `Rappel à partager : ${what}`,
    body: isNudge
      ? 'Personne n’a encore partagé le message dans le groupe WhatsApp de l’équipe.'
      : 'Partagez le message dans le groupe WhatsApp de l’équipe.',
  };
}
