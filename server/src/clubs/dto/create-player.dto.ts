import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Gender } from '@basketeasy/types/teams';
import type { CreatePlayerRequest } from '@basketeasy/types/players';
import { RecordParentalConsentDto } from './record-parental-consent.dto';

const GENDERS: Gender[] = ['MEN', 'WOMEN'];

export class CreatePlayerDto implements CreatePlayerRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

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

  // Optional at the DTO level and required in the service instead: whether it
  // is needed depends on birthDate, which class-validator can't express
  // without duplicating the majority calculation the shared type already owns.
  @IsOptional()
  @ValidateNested()
  @Type(() => RecordParentalConsentDto)
  parentalConsent?: RecordParentalConsentDto;
}
