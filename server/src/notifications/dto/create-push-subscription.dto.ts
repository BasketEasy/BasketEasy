import { Type } from 'class-transformer';
import { IsObject, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import type { CreatePushSubscriptionRequest } from '@basketeasy/types/notifications';

class PushSubscriptionKeysDto {
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MaxLength(256)
  auth!: string;
}

export class CreatePushSubscriptionDto implements CreatePushSubscriptionRequest {
  // The endpoint is a URL owned by the browser's push service (FCM, Mozilla,
  // Windows). `require_tld` stays on — every real push service is on a public
  // domain — but the length cap matters more: it is the table's unique key.
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
