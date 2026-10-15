import type { MailMessage } from '../mail-client';
import { renderEmail } from './layout';

export function passwordResetTemplate(to: string, resetUrl: string): MailMessage {
  return renderEmail(to, {
    subject: 'Réinitialisation de votre mot de passe',
    heading: 'Réinitialisez votre mot de passe',
    paragraphs: [
      'Vous avez demandé à réinitialiser le mot de passe de votre compte Kluvo.',
      'Ce lien est valable 1 heure et ne peut servir qu’une seule fois.',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.',
    ],
    cta: { label: 'Choisir un nouveau mot de passe', url: resetUrl },
    footnote: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : ${resetUrl}`,
  });
}
