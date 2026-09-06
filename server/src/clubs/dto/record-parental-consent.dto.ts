import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { RecordParentalConsentRequest } from '@basketeasy/types/parental-consent';

export class RecordParentalConsentDto implements RecordParentalConsentRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  attestedByName!: string;
}
