import { IsUrl, MaxLength } from 'class-validator';
import type { DeletePushSubscriptionRequest } from '@basketeasy/types/notifications';

export class DeletePushSubscriptionDto implements DeletePushSubscriptionRequest {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;
}
