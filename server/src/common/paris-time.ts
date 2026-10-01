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

/**
 * `date` moved by `weeks` Paris calendar weeks, keeping its Paris wall-clock
 * time: a 19:00 training stays 19:00 across a DST change, where adding
 * 7 × 24 h would land it at 18:00 or 20:00.
 */
export function addParisWeeks(date: Date, weeks: number): Date {
  // Shifted as an offset-less wall-clock reading, then resolved again: dayjs's
  // tz().add() keeps the starting offset, which is exactly the drift to avoid.
  const wallClock = dayjs.utc(dayjs(date).tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ss.SSS'));
  return parisWallClockToDate(wallClock.add(weeks, 'week').format('YYYY-MM-DDTHH:mm:ss.SSS'));
}

/** `date`'s Paris calendar day at the Paris wall-clock time `hour`:`minute`. */
export function withParisTimeOfDay(date: Date, hour: number, minute: number): Date {
  const day = dayjs(date).tz(TIMEZONE).format('YYYY-MM-DD');
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return parisWallClockToDate(`${day}T${time}`);
}
