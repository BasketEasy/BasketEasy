import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import type { LoginRequest } from '@basketeasy/types/auth';

export class LoginDto implements LoginRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
