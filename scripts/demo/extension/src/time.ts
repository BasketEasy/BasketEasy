// Europe/Paris wall-clock helpers. The demo season is generated relative to
// "now" in the viewer's browser, but fixtures read like a French calendar
// (a match at 20:30 is 20:30 in Orvault, whatever the laptop's timezone).

const PARIS = 'Europe/Paris';
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface ParisParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parisParts(ms: number): ParisParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function offsetAt(ms: number): number {
  const p = parisParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / MINUTE) * MINUTE;
}

/** UTC epoch ms of a Paris wall-clock time. */
export function parisTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

/** Paris midnight of the day `ms` falls on, shifted by `days`. */
export function parisDayStart(ms: number, days = 0): number {
  const p = parisParts(ms);
  const noon = Date.UTC(p.year, p.month - 1, p.day + days, 12);
  const q = new Date(noon);
  return parisTime(q.getUTCFullYear(), q.getUTCMonth() + 1, q.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday, in Paris. */
export function parisWeekday(ms: number): number {
  const p = parisParts(ms);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** The Paris day `days` after `dayStart`, at the given wall-clock time. */
export function atParis(dayStart: number, days: number, hour: number, minute: number): number {
  const p = parisParts(parisDayStart(dayStart, days));
  return parisTime(p.year, p.month, p.day, hour, minute);
}

export const iso = (ms: number): string => new Date(ms).toISOString();

const shortDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const clock = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS,
  hour: '2-digit',
  minute: '2-digit',
});
const weekdayLong = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long' });

/** « sam. 10 oct. » */
export const formatShortDate = (ms: number): string => shortDate.format(new Date(ms));
/** « 20:30 » */
export const formatClock = (ms: number): string => clock.format(new Date(ms));
/** « samedi » */
export const formatWeekday = (ms: number): string => weekdayLong.format(new Date(ms));
