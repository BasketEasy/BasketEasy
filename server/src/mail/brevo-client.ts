import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailClient, MailMessage } from './mail-client';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Every message this client sends is transactional and machine-generated — a
// convocation, a verification link, a password reset. None of them is an
// invitation to reply, so the visible sender is a no-reply address.
//
// But a reader *will* reply anyway, and a reply that bounces is worse than no
// reply address at all: a club volunteer who answers a convocation e-mail
// with "je ne peux pas venir samedi" has to reach a human, not a mailer
// daemon. So Reply-To points at the monitored mailbox while From stays
// no-reply.
const DEFAULT_FROM_EMAIL = 'no-reply@kluvo.net';
const DEFAULT_REPLY_TO_EMAIL = 'contact@kluvo.net';
const DEFAULT_FROM_NAME = 'Kluvo';

// Brevo's transactional HTTP API rather than SMTP: one fetch, no connection
// pooling or long-lived socket to manage in a container that may be scaled to
// zero, and the same reasoning docs/backend-stack.md gives for choosing Brevo
// over SES in the first place (EU-hosted, RGPD-friendly, generous free tier).
@Injectable()
export class BrevoClient implements MailClient {
  private readonly logger = new Logger(BrevoClient.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      // MailModule only binds this client when the key is set, so reaching
      // here means the env changed under a running process. Fail loudly
      // rather than silently pretending the mail went out.
      throw new Error('BREVO_API_KEY is not configured');
    }

    const fromName = this.config.get<string>('MAIL_FROM_NAME') || DEFAULT_FROM_NAME;

    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: this.config.get<string>('MAIL_FROM_EMAIL') || DEFAULT_FROM_EMAIL,
          name: fromName,
        },
        // Same display name as the sender: a reply that reads as coming from
        // "Kluvo" and goes to a different mailbox than it appears to is
        // confusing, and mail clients show this name in the compose window.
        replyTo: {
          email: this.config.get<string>('MAIL_REPLY_TO_EMAIL') || DEFAULT_REPLY_TO_EMAIL,
          name: fromName,
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
    });

    if (!response.ok) {
      // Brevo answers 4xx with a JSON { code, message }; keep the body in the
      // thrown error since MailService.sendAndForget only logs it, and a bad
      // sender domain (the most common misconfiguration) is only explained
      // there.
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo rejected the message (${response.status}): ${body}`);
    }

    this.logger.debug(`Sent "${message.subject}" to ${message.to}`);
  }
}
