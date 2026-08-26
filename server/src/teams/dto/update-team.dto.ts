import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TeamCategory, Gender } from '@prisma/client';
import type { UpdateTeamRequest } from '@basketeasy/types/teams';

export class UpdateTeamDto implements UpdateTeamRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(TeamCategory)
  category?: TeamCategory;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
