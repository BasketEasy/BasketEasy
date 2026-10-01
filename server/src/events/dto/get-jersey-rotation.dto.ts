import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ActingAsQueryDto } from '../../common/dto/acting-as-query.dto';

export class GetJerseyRotationDto extends ActingAsQueryDto {
  /** The year the season starts: 2026 means « saison 2026-2027 ». Defaults to the current one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  season?: number;
}
