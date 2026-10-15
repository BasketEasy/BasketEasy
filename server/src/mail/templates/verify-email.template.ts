import type { MailMessage } from '../mail-client';
import { renderEmail } from './layout';

export function verifyEmailTemplate(to: string, verifyUrl: string): MailMessage {
  return renderEmail(to, {
    subject: 'Confirmez votre adresse e-mail',
    heading: 'Confirmez votre adresse e-mail',
    paragraphs: [
      'Bienvenue sur Kluvo ! Il ne reste qu’une étape : confirmer que cette adresse est bien la vôtre.',
      'Ce lien est valable 24 heures.',
    ],
    cta: { label: 'Confirmer mon adresse', url: verifyUrl },
    footnote: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : ${verifyUrl}`,
  });
}
