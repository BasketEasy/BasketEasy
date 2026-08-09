import { IsUUID } from 'class-validator';
import type { AddTeamPlayerRequest } from '@basketeasy/types/teams';

export class AddTeamPlayerDto implements AddTeamPlayerRequest {
  @IsUUID()
  playerId!: string;
}
