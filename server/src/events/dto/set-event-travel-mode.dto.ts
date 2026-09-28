import { IsEnum } from 'class-validator';
import { EventTravelMode } from '@prisma/client';
import type { SetEventTravelModeRequest } from '@basketeasy/types/events';

export class SetEventTravelModeDto implements SetEventTravelModeRequest {
  @IsEnum(EventTravelMode)
  travelMode!: EventTravelMode;
}
