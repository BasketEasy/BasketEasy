import { IsEnum } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import type { UpdateTeamPlayerRequest } from '@basketeasy/types/teams';

export class UpdateTeamPlayerDto implements UpdateTeamPlayerRequest {
  @IsEnum(TeamMemberRole)
  role!: TeamMemberRole;
}
