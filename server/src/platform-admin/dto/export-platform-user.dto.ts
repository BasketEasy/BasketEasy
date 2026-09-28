import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ExportPlatformUserRequest } from '@basketeasy/types/platform-admin';

// Same bounds as ErasePlatformUserDto, and for the same reason: an export
// puts a complete copy of one person's data outside the system, so the
// recorded justification is what makes the ADMIN_EXPORT_GENERATED row usable
// as evidence rather than a bare timestamp.
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

export class ExportPlatformUserDto implements ExportPlatformUserRequest {
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}
