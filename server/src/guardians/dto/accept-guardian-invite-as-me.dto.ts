import { IsBoolean, IsOptional } from 'class-validator';
import type { AcceptGuardianInviteAsMeRequest } from '@basketeasy/types/guardians';

export class AcceptGuardianInviteAsMeDto implements AcceptGuardianInviteAsMeRequest {
  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
