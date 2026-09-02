import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import type {
  ConfirmScoresheetExtractionRequest,
  ParsedScoresheetData,
  ScoresheetTeamSide,
} from '@basketeasy/types/scoresheet-extraction';

const TEAM_SIDES: ScoresheetTeamSide[] = ['home', 'away'];

class ScoresheetQuarterScoreDto {
  @IsOptional()
  @IsNumber()
  home!: number | null;

  @IsOptional()
  @IsNumber()
  away!: number | null;
}

class ScoresheetPlayerStatsDto {
  @IsOptional()
  @IsIn(TEAM_SIDES)
  team!: ScoresheetTeamSide | null;

  @IsOptional()
  @IsNumber()
  number!: number | null;

  @IsOptional()
  @IsString()
  name!: string | null;

  @IsOptional()
  @IsNumber()
  points!: number | null;

  @IsOptional()
  @IsNumber()
  fouls!: number | null;
}

class ScoresheetScoringPlayDto {
  @IsIn(TEAM_SIDES)
  team!: ScoresheetTeamSide;

  @IsOptional()
  @IsNumber()
  jerseyNumber!: number | null;

  @IsOptional()
  @IsNumber()
  points!: number | null;

  @IsOptional()
  @IsNumber()
  runningScore!: number | null;
}

class ParsedScoresheetDataDto implements ParsedScoresheetData {
  @IsOptional()
  @IsNumber()
  homeScore!: number | null;

  @IsOptional()
  @IsNumber()
  awayScore!: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoresheetQuarterScoreDto)
  quarterScores!: ScoresheetQuarterScoreDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoresheetPlayerStatsDto)
  players!: ScoresheetPlayerStatsDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoresheetScoringPlayDto)
  scoringPlays!: ScoresheetScoringPlayDto[];
}

export class ConfirmScoresheetExtractionDto implements ConfirmScoresheetExtractionRequest {
  @IsOptional()
  @ValidateNested()
  @Type(() => ParsedScoresheetDataDto)
  corrections?: ParsedScoresheetDataDto;
}
