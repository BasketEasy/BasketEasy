export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Swappable seam, mirroring SCORESHEET_VISION_CLIENT: MailService depends on
// this interface/token rather than on BrevoClient directly, so changing
// provider (or dropping to the logging client in dev, which is what happens
// whenever BREVO_API_KEY is unset) is a DI binding change in MailModule and
// nothing else.
export interface MailClient {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_CLIENT = Symbol('MAIL_CLIENT');
