import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { UpdateProfileRequest } from '@basketeasy/types/auth';

export class UpdateProfileDto implements UpdateProfileRequest {
  // ValidateIf (not IsOptional) so an explicit `null` is still validated and
  // rejected with 400 — IsOptional treats null the same as undefined and
  // would let it through to Prisma, where `firstName`/`lastName` are
  // non-nullable columns, turning a bad request into an unhandled 500.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  // null is a meaningful value here (clear the avatar), so it's allowed
  // through unvalidated; only a defined, non-null value is checked as a
  // non-empty string. No @IsUrl() here — the repo doesn't use strict URL
  // validation elsewhere (see UpdatePlayerDto's userId field for the same
  // ValidateIf-over-IsOptional pattern), so this mirrors that convention.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  avatarUrl?: string | null;
}
