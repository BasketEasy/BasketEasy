import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EventType, EventVenue } from '@prisma/client';
import type { CreateEventRequest } from '@basketeasy/types/events';
import { EVENT_LOCATION_MAX_LENGTH } from '@basketeasy/types/events';
import { WA_OFFSET_MINUTES_MAX, WA_OFFSET_MINUTES_MIN } from '@basketeasy/types/whatsapp-reminder';
import { CreateEventRecurrenceDto } from './create-event-recurrence.dto';

export class CreateEventDto implements CreateEventRequest {
  @IsEnum(EventType)
  type!: EventType;

  @IsISO8601()
  startsAt!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(EVENT_LOCATION_MAX_LENGTH)
  location!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @MaxLength(EVENT_LOCATION_MAX_LENGTH)
  locationName?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ValidateIf((o: CreateEventDto) => o.type === EventType.MATCH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  opponentName?: string;

  @IsOptional()
  @IsEnum(EventVenue)
  venue?: EventVenue;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEventRecurrenceDto)
  recurrence?: CreateEventRecurrenceDto;

  @IsOptional()
  @IsBoolean()
  waReminderOverride?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(WA_OFFSET_MINUTES_MIN)
  @Max(WA_OFFSET_MINUTES_MAX)
  waOffsetMinutes?: number | null;
}
