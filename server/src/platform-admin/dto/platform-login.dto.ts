import { IsNumberString, Length } from 'class-validator';
import type { PlatformLoginRequest } from '@basketeasy/types/platform-admin';
import { TOTP_DIGITS } from '../totp.util';

export class PlatformLoginDto implements PlatformLoginRequest {
  // Validated to the exact shape here as well as inside verifyTotp: a
  // malformed code should be a 400 that never reaches the rate limiter, so
  // typing letters into the field can't spend an admin's five attempts.
  @IsNumberString({ no_symbols: true })
  @Length(TOTP_DIGITS, TOTP_DIGITS)
  totpCode!: string;
}
