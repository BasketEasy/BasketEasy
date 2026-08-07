import { IsEmail, IsString } from 'class-validator';
import type { LoginRequest } from '@basketeasy/types/auth';

export class LoginDto implements LoginRequest {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
