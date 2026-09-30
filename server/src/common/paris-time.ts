const TIMEZONE = 'Europe/Paris';

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// The Paris wall clock at an instant, read back as if it were UTC.
function parisWallClockAsUtc(date: Date): number {
  const p = Object.fromEntries(PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/**
 * The first instant of the Paris calendar day after the one `date` falls in.
 * The app stores no per-club timezone (Kluvo launches in Loire-Atlantique),
 * so "the day" of an event is its Europe/Paris day. Midnight is never a DST
 * transition in France (those happen at 02:00/03:00), so one offset lookup at
 * the guess is exact.
 */
export function endOfParisDay(date: Date): Date {
  const wall = new Date(parisWallClockAsUtc(date));
  const guess = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  const offset = parisWallClockAsUtc(new Date(guess)) - guess;
  return new Date(guess - offset);
}

/**
 * The instant a Paris wall-clock reading (an offset-less ISO string such as
 * FFBB's "2026-09-20T18:30:00") denotes. Two passes: the offset at the first
 * guess can differ from the offset at the answer when the reading sits within
 * an hour or two of a DST change.
 */
export function parisWallClockToDate(isoLocal: string): Date {
  const wall = Date.parse(`${isoLocal}Z`);
  let instant = wall - (parisWallClockAsUtc(new Date(wall)) - wall);
  instant = wall - (parisWallClockAsUtc(new Date(instant)) - instant);
  return new Date(instant);
}
