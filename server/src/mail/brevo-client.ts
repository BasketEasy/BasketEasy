import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailClient, MailMessage } from './mail-client';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

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

    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: this.config.get<string>('MAIL_FROM_EMAIL') || 'contact@kluvo.net',
          name: this.config.get<string>('MAIL_FROM_NAME') || 'Kluvo',
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
