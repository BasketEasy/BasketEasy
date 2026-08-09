import { IsUUID } from 'class-validator';
import type { AddTeamClubRequest } from '@basketeasy/types/teams';

export class AddTeamClubDto implements AddTeamClubRequest {
  @IsUUID()
  clubId!: string;
}
