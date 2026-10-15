import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Gender } from '@basketeasy/types/teams';
import type { UpdatePlayerRequest } from '@basketeasy/types/players';

const GENDERS: Gender[] = ['MEN', 'WOMEN'];

export class UpdatePlayerDto implements UpdatePlayerRequest {
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

  // null is a meaningful value here (unlink), so it's allowed through
  // unvalidated; only a defined, non-null value is checked as a UUID.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  userId?: string | null;

  // The remaining fields all follow the same "null clears, undefined leaves
  // unchanged" convention as userId.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(40)
  nationalId?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(40)
  licenseNumber?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601()
  birthDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsIn(GENDERS)
  gender?: Gender | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(20)
  licenseType?: string | null;
}
