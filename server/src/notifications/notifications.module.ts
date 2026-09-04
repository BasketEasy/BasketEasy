import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsController, PushSubscriptionsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_CLIENT } from './push-client';
import { WebPushClient } from './web-push.client';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [NotificationsController, PushSubscriptionsController],
  providers: [
    NotificationsService,
    WebPushClient,
    // The push provider swap point — see push-client.ts. Unlike MAIL_CLIENT
    // there is no logging fallback binding: WebPushClient already no-ops
    // (and reports a null public key) when VAPID keys are absent, so one
    // binding covers both configured and unconfigured deployments.
    { provide: PUSH_CLIENT, useExisting: WebPushClient },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
