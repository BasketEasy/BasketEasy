import { Injectable, Logger } from '@nestjs/common';
import type { MailClient, MailMessage } from './mail-client';

// The client MailModule binds when no BREVO_API_KEY is configured — local
// dev, CI, and these sandboxes. It logs what *would* have been sent,
// including the full body, so a verification or password-reset link can be
// copied out of the server log and followed by hand. That is the only way to
// exercise those flows end-to-end without a provider account, so the body is
// logged deliberately rather than truncated.
//
// It never throws: a missing mail provider must not be the reason a
// registration or a convocation fails.
@Injectable()
export class LogMailClient implements MailClient {
  private readonly logger = new Logger(LogMailClient.name);

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `[no BREVO_API_KEY — e-mail not sent] to=${message.to} subject=${message.subject}\n${message.text}`,
    );
    return Promise.resolve();
  }
}
