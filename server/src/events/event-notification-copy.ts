import type { EventType } from '@prisma/client';
import { describeEvent, formatEventMoment } from '../common/event-copy';
import { describeMeeting, type KnownMeeting } from '../meeting-points/meeting-notification-copy';

// Dates are formatted in Europe/Paris — see common/event-copy.ts.

export function convocationNotification(
  teamName: string,
  event: { type: EventType; startsAt: Date; location: string; opponentName: string | null },
  meeting: KnownMeeting | null = null,
): { title: string; body: string } {
  const meetingSentence = meeting ? ` RDV à ${describeMeeting(meeting)}.` : '';
  return {
    title: `Vous êtes convoqué·e — ${teamName}`,
    body: `Vous êtes convoqué·e pour ${describeEvent(event)} du ${formatEventMoment(event.startsAt)} à ${event.location}.${meetingSentence} Merci d’indiquer votre présence.`,
  };
}

/**
 * One notification per recipient for a whole cancellation, however many
 * occurrences it covered. A series delete can remove up to
 * MAX_RECURRING_OCCURRENCES (104) rows, and 104 notifications saying the same
 * thing is a worse outcome than no notification at all — so the plural case
 * summarises the count instead of naming each date.
 */
export function cancellationNotification(
  teamName: string,
  event: { type: EventType; startsAt: Date; opponentName: string | null },
  cancelledCount: number,
): { title: string; body: string } {
  if (cancelledCount > 1) {
    return {
      title: `${cancelledCount} séances annulées — ${teamName}`,
      body: `${cancelledCount} occurrences de cette série ont été annulées, à partir du ${formatEventMoment(event.startsAt)}.`,
    };
  }

  return {
    title: `Annulation — ${teamName}`,
    body: `${capitalise(describeEvent(event))} du ${formatEventMoment(event.startsAt)} a été annulé.`,
  };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
