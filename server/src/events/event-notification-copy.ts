import type { EventType } from '@prisma/client';
import { describeEvent, formatEventMoment } from '../common/event-copy';
import { describeMeeting, type KnownMeeting } from '../meeting-points/meeting-notification-copy';
import {
  SELF_SUBJECT,
  convocationSentence,
  forWhomPrefix,
  type NotificationSubject,
} from '../common/notification-subject';

// Dates are formatted in Europe/Paris — see common/event-copy.ts. Every
// function takes who the reader is told about (themself, their children, or
// both — see common/notification-subject.ts); the default is the reader
// alone, whose copy is unchanged.

function presenceRequest(subject: NotificationSubject): string {
  if (subject.children.length === 0) return 'votre présence';
  if (subject.self) return 'vos présences';
  return subject.children.length === 1 ? 'sa présence' : 'leur présence';
}

export function convocationNotification(
  teamName: string,
  event: { type: EventType; startsAt: Date; location: string; opponentName: string | null },
  meeting: KnownMeeting | null = null,
  subject: NotificationSubject = SELF_SUBJECT,
): { title: string; body: string } {
  const meetingSentence = meeting ? ` RDV à ${describeMeeting(meeting)}.` : '';
  const sentence = convocationSentence(subject);
  return {
    title: `${sentence} — ${teamName}`,
    body: `${sentence} pour ${describeEvent(event)} du ${formatEventMoment(event.startsAt)} à ${event.location}.${meetingSentence} Merci d’indiquer ${presenceRequest(subject)}.`,
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
  subject: NotificationSubject = SELF_SUBJECT,
): { title: string; body: string } {
  const prefix = forWhomPrefix(subject);
  if (cancelledCount > 1) {
    return {
      title: `${cancelledCount} séances annulées — ${teamName}`,
      body: `${prefix}${cancelledCount} occurrences de cette série ont été annulées, à partir du ${formatEventMoment(event.startsAt)}.`,
    };
  }

  return {
    title: `Annulation — ${teamName}`,
    body: `${prefix}${capitalise(describeEvent(event))} du ${formatEventMoment(event.startsAt)} a été annulé.`,
  };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
