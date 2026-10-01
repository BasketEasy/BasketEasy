// A French basketball season runs September to August, so a calendar year is
// the wrong window: it would cut a season in half at Christmas. seasonYear is
// the year the season *starts*, matching how the FFBB labels one ("saison
// 2026-2027"). Derived from Event.startsAt rather than stored — nothing else
// in the schema knows about seasons, and a stored column would need
// backfilling and would drift from the event it describes.
const SEASON_START_MONTH = 8; // September, zero-based.

export function seasonYearFor(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= SEASON_START_MONTH ? year : year - 1;
}

export function seasonWindow(seasonYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(seasonYear, SEASON_START_MONTH, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(seasonYear + 1, SEASON_START_MONTH, 1, 0, 0, 0, 0) - 1),
  };
}
