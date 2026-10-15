import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import type { AddClubMemberRequest } from '@basketeasy/types/club-members';

export class AddClubMemberDto implements AddClubMemberRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
