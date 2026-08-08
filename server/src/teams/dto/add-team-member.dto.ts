import { IsUUID } from 'class-validator';
import type { AddTeamMemberRequest } from '@basketeasy/types/teams';

export class AddTeamMemberDto implements AddTeamMemberRequest {
  @IsUUID()
  userId!: string;
}
