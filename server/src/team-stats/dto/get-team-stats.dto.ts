import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// The app's first season and a ceiling far enough out that it will never
// bite: the range exists to keep a typo (or a probe) from asking for a window
// a thousand years wide, not to express a real product limit.
const EARLIEST_SEASON_YEAR = 2000;
const LATEST_SEASON_YEAR = 2100;

export class GetTeamStatsDto {
  /** The year the season starts: 2026 means "saison 2026-2027". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(EARLIEST_SEASON_YEAR)
  @Max(LATEST_SEASON_YEAR)
  season?: number;
}
