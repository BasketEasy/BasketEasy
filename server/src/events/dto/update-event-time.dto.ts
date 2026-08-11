import { IsIn, IsInt, Max, Min } from 'class-validator';
import type { EventUpdateScope, UpdateEventTimeOfDayRequest } from '@basketeasy/types/events';

const TIME_OF_DAY_SCOPES: Extract<EventUpdateScope, 'THIS_AND_FUTURE' | 'ALL'>[] = [
  'THIS_AND_FUTURE',
  'ALL',
];

export class UpdateEventTimeDto implements UpdateEventTimeOfDayRequest {
  @IsIn(TIME_OF_DAY_SCOPES)
  scope!: Extract<EventUpdateScope, 'THIS_AND_FUTURE' | 'ALL'>;

  @IsInt()
  @Min(0)
  @Max(23)
  hour!: number;

  @IsInt()
  @Min(0)
  @Max(59)
  minute!: number;
}
