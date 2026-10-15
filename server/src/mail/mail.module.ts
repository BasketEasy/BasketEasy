import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_CLIENT, type MailClient } from './mail-client';
import { BrevoClient } from './brevo-client';
import { LogMailClient } from './log-mail.client';
import { MailService } from './mail.service';

@Module({
  providers: [
    MailService,
    BrevoClient,
    LogMailClient,
    // The provider swap point — see mail-client.ts. The binding is a factory
    // rather than a plain useExisting because the choice is made from the
    // environment: with a BREVO_API_KEY the real client is bound, without one
    // every send goes to the log (dev, CI, these sandboxes), which keeps the
    // whole verification/reset flow exercisable with no provider account.
    //
    // Deliberately NOT boot-validated in AppModule.validateEnv — same policy
    // as REDIS_URL, R2_* and GEMINI_API_KEY: a missing integration credential
    // degrades one feature, it doesn't stop the server serving every route.
    {
      provide: MAIL_CLIENT,
      inject: [ConfigService, BrevoClient, LogMailClient],
      useFactory: (config: ConfigService, brevo: BrevoClient, log: LogMailClient): MailClient =>
        config.get<string>('BREVO_API_KEY') ? brevo : log,
    },
  ],
  exports: [MailService],
})
export class MailModule {}
