import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EventSharePlatform } from '@prisma/client';
import type {
  ConfirmEventShareRequest,
  UpdateTeamWhatsAppSettingsRequest,
} from '@basketeasy/types/whatsapp-reminder';

export class UpdateTeamWhatsAppSettingsDto implements UpdateTeamWhatsAppSettingsRequest {
  // null or an empty string both mean « the default template ».
  @IsOptional()
  @IsString()
  reminderTemplate!: string | null;
}

export class ConfirmEventShareDto implements ConfirmEventShareRequest {
  @IsEnum(EventSharePlatform)
  platform!: EventSharePlatform;
}
