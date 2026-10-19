import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MATCH_PERIODS,
  type MatchPeriodScore,
  type UpdateMatchStatsLine,
  type UpdateMatchStatsRequest,
} from '@basketeasy/types/team-stats';

// A ceiling that only keeps a typo (or a probe) out: no real basketball score
// comes near it.
const MAX_STAT = 300;

class MatchPeriodScoreDto implements MatchPeriodScore {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  ours!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  theirs!: number | null;
}

class UpdateMatchStatsLineDto implements UpdateMatchStatsLine {
  @IsUUID()
  teamPlayerId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  points!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  fouls!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  freeThrowPoints!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  twoPointPoints!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  threePointPoints!: number | null;
}

export class UpdateMatchStatsDto implements UpdateMatchStatsRequest {
  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  ourScore!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STAT)
  theirScore!: number;

  @IsArray()
  @ArrayMaxSize(MAX_MATCH_PERIODS)
  @ValidateNested({ each: true })
  @Type(() => MatchPeriodScoreDto)
  periods!: MatchPeriodScoreDto[];

  // Required but allowed empty: a manager can remove every line (the match
  // was played by guests only). Capped well above any roster.
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UpdateMatchStatsLineDto)
  lines!: UpdateMatchStatsLineDto[];
}
