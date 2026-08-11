import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import type { AddTeamAdminRequest } from '@basketeasy/types/team-admins';

export class AddTeamAdminDto implements AddTeamAdminRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
