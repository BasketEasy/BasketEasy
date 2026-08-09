import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { CreateEventRequest } from '@basketeasy/types/events';
import { CreateEventRecurrenceDto } from './create-event-recurrence.dto';

export class CreateEventDto implements CreateEventRequest {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEventRecurrenceDto)
  recurrence?: CreateEventRecurrenceDto;
}
