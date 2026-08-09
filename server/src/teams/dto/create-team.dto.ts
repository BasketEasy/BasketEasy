import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { TeamCategory, TeamGender } from '@prisma/client';
import type { CreateTeamRequest } from '@basketeasy/types/teams';

export class CreateTeamDto implements CreateTeamRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsEnum(TeamCategory)
  category!: TeamCategory;

  @IsEnum(TeamGender)
  gender!: TeamGender;
}
