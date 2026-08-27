import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EventType, EventVenue } from '@prisma/client';
import type { CreateEventRequest } from '@basketeasy/types/events';
import { CreateEventRecurrenceDto } from './create-event-recurrence.dto';

export class CreateEventDto implements CreateEventRequest {
  @IsEnum(EventType)
  type!: EventType;

  @IsISO8601()
  startsAt!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  location!: string;

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
}
