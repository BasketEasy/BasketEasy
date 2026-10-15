import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ResetPasswordRequest } from '@basketeasy/types/account-security';

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  // Same bounds as RegisterDto's password: the reset path must not be a way
  // to set a weaker password than registration would accept.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
