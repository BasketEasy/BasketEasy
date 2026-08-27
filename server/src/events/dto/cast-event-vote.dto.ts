import { IsIn, IsString } from 'class-validator';
import type { CastEventVoteRequest, EventVoteCategory } from '@basketeasy/types/events';

export class CastEventVoteDto implements CastEventVoteRequest {
  @IsIn(['BEST', 'WORST'])
  category!: EventVoteCategory;

  @IsString()
  teamPlayerId!: string;
}
