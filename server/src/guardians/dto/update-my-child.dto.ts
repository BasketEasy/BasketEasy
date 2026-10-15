import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { Gender } from '@basketeasy/types/teams';
import type { UpdateMyChildRequest } from '@basketeasy/types/guardians';

const GENDERS: Gender[] = ['MEN', 'WOMEN'];

// Same null/undefined conventions as UpdatePlayerDto, over the only four
// fields a parent may correct. The global ValidationPipe's whitelist strips
// anything else (licence fields, nationalId), so they can't be smuggled in.
export class UpdateMyChildDto implements UpdateMyChildRequest {
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

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601()
  birthDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsIn(GENDERS)
  gender?: Gender | null;
}
