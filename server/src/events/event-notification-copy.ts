import type { EventType } from '@prisma/client';

// The app stores no per-club timezone (see the bulk hour-of-day update's
// documented limitation in CLAUDE.md), and Kluvo launches in Loire-Atlantique,
// so notification copy formats dates in Europe/Paris. Formatting in UTC would
// put a Saturday 20:30 match on "samedi 19:30" for every French reader, which
// is worse than the DST edge case a fixed zone leaves open. This becomes a
// per-club setting when the app has one.
const TIMEZONE = 'Europe/Paris';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIMEZONE,
});

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIMEZONE,
});

/** e.g. "samedi 12 septembre à 20:30" */
export function formatEventMoment(startsAt: Date): string {
  return `${DATE_FORMAT.format(startsAt)} à ${TIME_FORMAT.format(startsAt)}`;
}

/** e.g. "le match contre ASVEL" or "l'entraînement" */
export function describeEvent(event: { type: EventType; opponentName: string | null }): string {
  if (event.type === 'MATCH') {
    return event.opponentName ? `le match contre ${event.opponentName}` : 'le match';
  }
  return 'l’entraînement';
}

/** A resolved meeting point with a known time — what the RDV sentences need. */
export interface KnownMeeting {
  meetsAt: Date;
  placeName: string;
}

/** e.g. "19:15 — Parking salle Coubertin" */
function describeMeeting(meeting: KnownMeeting): string {
  return `${TIME_FORMAT.format(meeting.meetsAt)} — ${meeting.placeName}`;
}

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
 * Sent only to players coming to the meeting point — someone going straight
 * to the gym isn't affected by where or when the group meets. `isFirst` is
 * the hour becoming known at all (« RDV fixé »), rather than a known hour
 * moving (« RDV modifié »).
 */
export function meetingChangedNotification(
  teamName: string,
  event: { type: EventType; startsAt: Date; opponentName: string | null },
  meeting: KnownMeeting,
  isFirst = false,
): { title: string; body: string } {
  const moment = `${describeEvent(event)} du ${formatEventMoment(event.startsAt)}`;
  return isFirst
    ? {
        title: `RDV fixé — ${teamName}`,
        body: `Rendez-vous pour ${moment} : ${describeMeeting(meeting)}.`,
      }
    : {
        title: `RDV modifié — ${teamName}`,
        body: `Nouveau rendez-vous pour ${moment} : ${describeMeeting(meeting)}.`,
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
