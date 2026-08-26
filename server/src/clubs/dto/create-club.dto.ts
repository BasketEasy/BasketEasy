import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateClubRequest } from '@basketeasy/types/clubs';

export class CreateClubDto implements CreateClubRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  // Stored unvalidated — no working lookup exists to confirm a code is
  // real. See docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  ffbbClubCode?: string;
}
