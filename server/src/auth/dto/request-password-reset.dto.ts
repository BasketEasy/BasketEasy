import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import type { RequestPasswordResetRequest } from '@basketeasy/types/account-security';

export class RequestPasswordResetDto implements RequestPasswordResetRequest {
  // Same normalisation as RegisterDto/AcceptPlayerInviteDto — the lookup is
  // by exact match on User.email, so a differently-cased address typed into
  // the reset form has to resolve to the same row.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
