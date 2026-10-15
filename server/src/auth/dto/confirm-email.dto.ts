import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ConfirmEmailRequest } from '@basketeasy/types/account-security';

export class ConfirmEmailDto implements ConfirmEmailRequest {
  // 64 hex chars from randomBytes(32); bounded on both sides so a
  // multi-megabyte body never reaches the hash-and-lookup path.
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;
}
