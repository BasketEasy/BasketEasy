import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EventSharePlatform } from '@prisma/client';
import {
  WA_OFFSET_MINUTES_MAX,
  WA_OFFSET_MINUTES_MIN,
  type ConfirmEventShareRequest,
  type UpdateTeamWhatsAppSettingsRequest,
} from '@basketeasy/types/whatsapp-reminder';

export class UpdateTeamWhatsAppSettingsDto implements UpdateTeamWhatsAppSettingsRequest {
  // null or an empty string both mean « the default template ».
  @IsOptional()
  @IsString()
  reminderTemplate?: string | null;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(WA_OFFSET_MINUTES_MIN)
  @Max(WA_OFFSET_MINUTES_MAX)
  defaultOffsetMinutes?: number;
}

export class ConfirmEventShareDto implements ConfirmEventShareRequest {
  @IsEnum(EventSharePlatform)
  platform!: EventSharePlatform;
}
