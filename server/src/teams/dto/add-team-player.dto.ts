import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import type { AddTeamPlayerRequest } from '@basketeasy/types/teams';

export class AddTeamPlayerDto implements AddTeamPlayerRequest {
  @IsUUID()
  playerId!: string;

  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole;
}
