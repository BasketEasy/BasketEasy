import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  ADMIN_SUPPORT_ACTION_KINDS,
  type AdminSupportActionKind,
} from '@basketeasy/types/platform-admin-actions';
import type { ListAuditLogParams } from '@basketeasy/types/platform-admin';

export class ListAuditLogDto implements ListAuditLogParams {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  playerId?: string;

  @IsOptional()
  @IsIn(ADMIN_SUPPORT_ACTION_KINDS)
  action?: AdminSupportActionKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
