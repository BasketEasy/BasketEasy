import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateEventRequest } from '@basketeasy/types/events';

export class UpdateEventDto implements UpdateEventRequest {
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
}
