import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import type {
  ConfirmScoresheetExtractionRequest,
  ParsedScoresheetData,
} from '@basketeasy/types/scoresheet-extraction';

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
}

export class ConfirmScoresheetExtractionDto implements ConfirmScoresheetExtractionRequest {
  @IsOptional()
  @ValidateNested()
  @Type(() => ParsedScoresheetDataDto)
  corrections?: ParsedScoresheetDataDto;
}
