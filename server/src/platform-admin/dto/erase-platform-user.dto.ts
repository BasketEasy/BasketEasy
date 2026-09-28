import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ErasePlatformUserRequest } from '@basketeasy/types/platform-admin';

// Long enough that "ok" or "." doesn't satisfy it. The reason is the whole
// point of routing a manual erasure through an audited action rather than a
// psql session, so an empty-ish one defeats the control.
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

export class ErasePlatformUserDto implements ErasePlatformUserRequest {
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}
