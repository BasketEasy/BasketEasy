import { IsIn, IsOptional } from 'class-validator';
import type { EventUpdateScope } from '@basketeasy/types/events';

const EVENT_UPDATE_SCOPES: EventUpdateScope[] = ['THIS', 'THIS_AND_FUTURE', 'ALL'];

export class DeleteEventQueryDto {
  @IsOptional()
  @IsIn(EVENT_UPDATE_SCOPES)
  scope?: EventUpdateScope;
}
