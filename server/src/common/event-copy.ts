import type { EventType } from '@prisma/client';

// Shared by every module that writes a sentence about an event (Events'
// convocation and cancellation copy, Meeting points' RDV copy), so the date
// format and the fixture wording can't drift between them.

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

/** e.g. "20:30" */
export function formatTime(date: Date): string {
  return TIME_FORMAT.format(date);
}

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
