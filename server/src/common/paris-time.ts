import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

// The app stores no per-club timezone (Kluvo launches in Loire-Atlantique),
// so every wall-clock reading and "day" is a Europe/Paris one.
const TIMEZONE = 'Europe/Paris';

/** The first instant of the Paris calendar day after the one `date` falls in. */
export function endOfParisDay(date: Date): Date {
  return dayjs(date).tz(TIMEZONE).add(1, 'day').startOf('day').toDate();
}

/**
 * The instant a Paris wall-clock reading (an offset-less ISO string such as
 * FFBB's "2026-09-20T18:30:00") denotes, DST included.
 */
export function parisWallClockToDate(isoLocal: string): Date {
  return dayjs.tz(isoLocal, TIMEZONE).toDate();
}
