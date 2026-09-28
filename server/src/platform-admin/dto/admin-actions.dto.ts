import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { ClubRole } from '@basketeasy/types/club-members';
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  type AddTeamAdminRequest,
  type AdminReasonRequest,
  type ChangeClubRoleRequest,
  type RecordConsentRequest,
  type TransferTeamOwnershipRequest,
} from '@basketeasy/types/platform-admin-actions';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * The reason every audited back-office write carries: support actions,
 * export and erasure. A write with no recorded justification is the gap the
 * audit log exists to close.
 */
export class ReasonDto implements AdminReasonRequest {
  @Transform(trim)
  @IsString()
  @MinLength(ADMIN_REASON_MIN_LENGTH)
  @MaxLength(ADMIN_REASON_MAX_LENGTH)
  reason!: string;
}

export class ChangeClubRoleDto extends ReasonDto implements ChangeClubRoleRequest {
  @IsIn(['ADMIN', 'MEMBER'])
  role!: ClubRole;
}

export class AddTeamAdminDto extends ReasonDto implements AddTeamAdminRequest {
  @IsUUID()
  userId!: string;
}

export class TransferTeamOwnershipDto extends ReasonDto implements TransferTeamOwnershipRequest {
  @IsUUID()
  clubId!: string;
}

export class RecordConsentDto extends ReasonDto implements RecordConsentRequest {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  givenBy!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  method!: string;
}
