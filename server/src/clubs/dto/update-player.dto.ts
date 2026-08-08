import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { UpdatePlayerRequest } from '@basketeasy/types/players';

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
}
