import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EventType, EventVenue } from '@prisma/client';
import type { EventUpdateScope, UpdateEventRequest } from '@basketeasy/types/events';
import { WA_OFFSET_MINUTES_MAX, WA_OFFSET_MINUTES_MIN } from '@basketeasy/types/whatsapp-reminder';

const EVENT_UPDATE_SCOPES: EventUpdateScope[] = ['THIS', 'THIS_AND_FUTURE', 'ALL'];

export class UpdateEventDto implements UpdateEventRequest {
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  opponentName?: string;

  @IsOptional()
  @IsEnum(EventVenue)
  venue?: EventVenue;

  @IsOptional()
  @IsIn(EVENT_UPDATE_SCOPES)
  scope?: EventUpdateScope;

  // null clears the override (inherit the team), absent leaves it: IsOptional
  // skips validation for both.
  @IsOptional()
  @IsBoolean()
  waReminderOverride?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(WA_OFFSET_MINUTES_MIN)
  @Max(WA_OFFSET_MINUTES_MAX)
  waOffsetMinutes?: number | null;
}
