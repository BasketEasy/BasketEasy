const displayFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Formats an ISO date string for display, e.g. "5 janv. 2026, 18:00". */
export function formatEventDate(isoDate: string): string {
  return displayFormatter.format(new Date(isoDate));
}

const dateOnlyFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

/** Formats an ISO date string's date only, e.g. "5 janv. 2026" — used when the time-of-day isn't confirmed yet (never render FFBB's 00:00:00 placeholder as if it were a real kickoff time). */
export function formatEventDateOnly(isoDate: string): string {
  return dateOnlyFormatter.format(new Date(isoDate));
}

const dayHeadingFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Formats an ISO date string as a day-group heading, e.g. "Lundi 12 janvier". */
export function formatDayHeading(isoDate: string): string {
  const label = dayHeadingFormatter.format(new Date(isoDate));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats an ISO date string's time-of-day only, e.g. "18:00". */
export function formatEventTime(isoDate: string): string {
  return timeFormatter.format(new Date(isoDate));
}

/** Local calendar-day key (YYYY-MM-DD) for grouping events by day. */
export function eventDayKey(isoDate: string): string {
  const date = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converts an ISO date string to the value a `datetime-local` input expects. */
export function toDatetimeLocalValue(isoDate: string): string {
  const date = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const dayShortFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** Formats an ISO date string as a short day, e.g. "sam. 10 oct." — a fact tile's label. */
export function formatEventDayShort(isoDate: string): string {
  return dayShortFormatter.format(new Date(isoDate));
}

const dayFullFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Formats an ISO date string as a full, spelled-out day, e.g. "Samedi 5 septembre 2026" — the event detail hero's date line, which appends the time itself. */
export function formatEventDayFull(isoDate: string): string {
  const label = dayFullFormatter.format(new Date(isoDate));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long is left before an event, as the countdown a coach reads on the
 * pilot band ("J-3"). Null once the day itself has passed — a negative "J+2"
 * would say nothing a past match's own date does not already say.
 *
 * Counted in whole local calendar days, not in 24h slices, so an event
 * tomorrow evening reads "J-1" from this morning rather than "J-2".
 */
export function eventCountdownLabel(isoDate: string, now: Date = new Date()): string | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(isoDate)) - startOfDay(now)) / DAY_MS);
  if (days < 0) {
    return null;
  }
  if (days === 0) {
    return 'Aujourd’hui';
  }
  if (days === 1) {
    return 'Demain';
  }
  return `J-${days}`;
}
