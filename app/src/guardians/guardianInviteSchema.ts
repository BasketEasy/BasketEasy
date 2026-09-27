import { z } from 'zod';
import { GUARDIAN_CONSENT_REQUIRED_MESSAGE } from './guardianConsent';

/**
 * The register-and-follow form. `consent` is required to be true only when
 * the invite says the child is a minor — the same rule the API enforces
 * (400 PARENTAL_CONSENT_REQUIRED), checked here first so a parent is never
 * sent round a network trip to learn it.
 */
export function guardianInviteSchema(requiresConsent: boolean) {
  return z
    .object({
      firstName: z.string().trim().min(1, 'Prénom requis'),
      lastName: z.string().trim().min(1, 'Nom requis'),
      email: z.string().email('Adresse email invalide'),
      password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
      consent: z.boolean(),
    })
    .refine((values) => !requiresConsent || values.consent, {
      message: GUARDIAN_CONSENT_REQUIRED_MESSAGE,
      path: ['consent'],
    });
}

export type GuardianInviteFormValues = z.infer<ReturnType<typeof guardianInviteSchema>>;
