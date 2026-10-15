import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Gender } from '@basketeasy/types/teams';
import type { ImportPlayersRequest, ImportPlayersRow } from '@basketeasy/types/players';

const GENDERS: Gender[] = ['MEN', 'WOMEN'];

class ImportPlayersRowDto implements ImportPlayersRow {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licenseType?: string;
}

export class ImportPlayersDto implements ImportPlayersRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPlayersRowDto)
  rows!: ImportPlayersRowDto[];
}
