import { IsUUID } from 'class-validator';
import type { ProposeJerseySwapRequest } from '@basketeasy/types/jersey-duty';

export class ProposeJerseySwapDto implements ProposeJerseySwapRequest {
  @IsUUID()
  teamPlayerId!: string;
}
