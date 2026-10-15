const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/**
 * Relative age for a notification row: « à l'instant », « il y a 12 min »,
 * « il y a 3 h », « hier », then an absolute date.
 *
 * Relative only while it stays useful. Past a couple of days "il y a 9 jours"
 * is harder to place than "26 août", so it switches to the date rather than
 * counting up indefinitely.
 */
export function formatNotificationAge(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < MINUTE_MS) return 'à l’instant';
  if (elapsed < HOUR_MS) return `il y a ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `il y a ${Math.floor(elapsed / HOUR_MS)} h`;
  if (elapsed < 2 * DAY_MS) return 'hier';
  return DATE_FORMAT.format(new Date(iso));
}
