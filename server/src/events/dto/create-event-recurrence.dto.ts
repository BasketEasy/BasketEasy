import { IsIn, IsISO8601 } from 'class-validator';
import type { EventRecurrenceFrequency, EventRecurrenceRequest } from '@basketeasy/types/events';

const RECURRENCE_FREQUENCIES: EventRecurrenceFrequency[] = ['WEEKLY'];

export class CreateEventRecurrenceDto implements EventRecurrenceRequest {
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency!: EventRecurrenceFrequency;

  @IsISO8601()
  until!: string;
}
