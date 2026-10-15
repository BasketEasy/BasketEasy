import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import type { UpdateTeamPlayerRequest } from '@basketeasy/types/teams';

// Both fields are optional so the role select and the jersey-wash exemption
// toggle each send only what they change; the service refuses an empty body.
export class UpdateTeamPlayerDto implements UpdateTeamPlayerRequest {
  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole;

  @IsOptional()
  @IsBoolean()
  jerseyDutyExempt?: boolean;
}
