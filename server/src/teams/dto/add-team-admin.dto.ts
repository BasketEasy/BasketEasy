import { IsUUID } from 'class-validator';
import type { AddTeamAdminRequest } from '@basketeasy/types/team-admins';

export class AddTeamAdminDto implements AddTeamAdminRequest {
  @IsUUID()
  userId!: string;
}
