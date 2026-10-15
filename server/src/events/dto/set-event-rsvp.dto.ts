import { IsEnum } from 'class-validator';
import { EventRsvpStatus } from '@prisma/client';
import type { SetEventRsvpRequest } from '@basketeasy/types/events';

export class SetEventRsvpDto implements SetEventRsvpRequest {
  @IsEnum(EventRsvpStatus)
  status!: EventRsvpStatus;
}
