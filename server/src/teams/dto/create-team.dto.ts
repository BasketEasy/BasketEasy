import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TeamCategory, Gender } from '@prisma/client';
import type { CreateTeamRequest } from '@basketeasy/types/teams';

export class CreateTeamDto implements CreateTeamRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsEnum(TeamCategory)
  category!: TeamCategory;

  @IsEnum(Gender)
  gender!: Gender;

  // Shape/reachability validated live against FFBB in TeamsService, not here
  // — this DTO only guards against an empty/oversized string.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  ffbbTeamUrl?: string;
}
