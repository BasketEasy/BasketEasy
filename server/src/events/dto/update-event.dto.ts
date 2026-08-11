import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EventType } from '@prisma/client';
import type { EventUpdateScope, UpdateEventRequest } from '@basketeasy/types/events';

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
  @IsIn(EVENT_UPDATE_SCOPES)
  scope?: EventUpdateScope;
}
