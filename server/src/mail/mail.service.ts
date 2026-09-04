import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_CLIENT, type MailClient, type MailMessage } from './mail-client';
import { verifyEmailTemplate } from './templates/verify-email.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { notificationTemplate } from './templates/notification.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_CLIENT) private readonly client: MailClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * Turns a stored `deepLink` (always a frontend-relative path — see the
   * Notification model) into an absolute URL for an e-mail or a push payload.
   * The origin is resolved per send rather than stored, so moving the
   * frontend to a new hostname doesn't invalidate anything already written.
   */
  absoluteUrl(path: string): string {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return `${frontendUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  sendVerificationEmail(to: string, token: string): Promise<void> {
    return this.client.send(verifyEmailTemplate(to, this.absoluteUrl(`/verify-email/${token}`)));
  }

  sendPasswordResetEmail(to: string, token: string): Promise<void> {
    return this.client.send(
      passwordResetTemplate(to, this.absoluteUrl(`/reset-password/${token}`)),
    );
  }

  sendNotificationEmail(
    to: string,
    notification: { title: string; body: string | null; deepLink: string | null },
  ): Promise<void> {
    return this.client.send(
      notificationTemplate(to, {
        title: notification.title,
        body: notification.body,
        url: notification.deepLink ? this.absoluteUrl(notification.deepLink) : null,
      }),
    );
  }

  /**
   * Runs a send without letting its failure reach the caller.
   *
   * Every send in this codebase is a side effect of something else — a
   * registration, a convocation, a finished OCR job. A provider outage,
   * a rejected sender domain or a bounced address must never turn one of
   * those into a failed request, and there is nothing the caller could do
   * with the error anyway, so it is logged here and swallowed.
   *
   * Returns void synchronously: callers `void mail.sendAndForget(...)` and
   * carry on rather than awaiting the round trip to the provider.
   */
  sendAndForget(send: () => Promise<void>, context: string): void {
    void send().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send ${context}: ${message}`);
    });
  }

  /** Escape hatch for a caller that has already built its own message. */
  send(message: MailMessage): Promise<void> {
    return this.client.send(message);
  }
}
