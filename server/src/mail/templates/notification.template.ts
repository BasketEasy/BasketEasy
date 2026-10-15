import type { MailMessage } from '../mail-client';
import { renderEmail } from './layout';

/**
 * The e-mailed copy of an in-app notification. Deliberately generic: the
 * emitting module already composed `title`/`body` as finished French
 * sentences (see the Notification model's comment), so there is one template
 * for every NotificationType rather than one per type drifting out of sync
 * with the in-app copy.
 */
export function notificationTemplate(
  to: string,
  notification: { title: string; body: string | null; url: string | null },
): MailMessage {
  return renderEmail(to, {
    subject: notification.title,
    heading: notification.title,
    paragraphs: notification.body ? [notification.body] : [],
    cta: notification.url ? { label: 'Ouvrir dans Kluvo', url: notification.url } : undefined,
    footnote:
      'Vous pouvez désactiver ces e-mails à tout moment depuis « Mon profil » dans Kluvo. Les notifications resteront visibles dans l’application.',
  });
}
