import type { ClubRole } from '@basketeasy/types/club-members';
import type { EventScoresheetStatus } from '@basketeasy/types/events';
import type { ParentalConsentSource } from '@basketeasy/types/guardians';
import type {
  AdminConsentState,
  AdminEventSummary,
  AdminInviteState,
  AdminTeamRef,
} from '@basketeasy/types/platform-admin-browse';
import type { BadgeProps } from '@basketeasy/ui/badge';
import { teamCategoryLabel, teamGenderLabel } from '../../clubs/teamLabels';

// Labels and tones shared by every back-office page. Dates are rendered in
// Europe/Paris, the same rule as notification copy: the app stores no
// per-club timezone and launches in Loire-Atlantique.

type Tone = NonNullable<BadgeProps['tone']>;

export function formatAdminDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    dateStyle: 'medium',
    timeZone: 'Europe/Paris',
  });
}

export function formatAdminDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  });
}

export function teamLabel(team: AdminTeamRef): string {
  return `${team.name} · ${teamCategoryLabel(team.category)} ${teamGenderLabel(team.gender)}`;
}

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Membre',
};

export const CLUB_ROLE_TONES: Record<ClubRole, Tone> = {
  ADMIN: 'brand',
  MEMBER: 'muted',
};

export const SCORESHEET_STATUS_LABELS: Record<EventScoresheetStatus, string> = {
  UPLOADED: 'Envoyée',
  QUEUED: 'En file',
  PROCESSING: 'En lecture',
  PARSED: 'Lue',
  NEEDS_REVIEW: 'À vérifier',
  CONFIRMED: 'Confirmée',
  FAILED: 'Échec',
};

export const SCORESHEET_STATUS_TONES: Record<EventScoresheetStatus, Tone> = {
  UPLOADED: 'muted',
  QUEUED: 'muted',
  PROCESSING: 'muted',
  PARSED: 'structure',
  NEEDS_REVIEW: 'brand',
  CONFIRMED: 'success',
  FAILED: 'danger',
};

export const CONSENT_STATE_LABELS: Record<AdminConsentState, string> = {
  'not-required': 'Majeur',
  recorded: 'Autorisation enregistrée',
  missing: 'Autorisation manquante',
  unknown: 'Âge inconnu',
};

export const CONSENT_STATE_TONES: Record<AdminConsentState, Tone> = {
  'not-required': 'muted',
  recorded: 'success',
  missing: 'danger',
  unknown: 'muted',
};

export const INVITE_STATE_LABELS: Record<AdminInviteState, string> = {
  live: 'En cours',
  expired: 'Expirée',
  accepted: 'Acceptée',
};

export const INVITE_STATE_TONES: Record<AdminInviteState, Tone> = {
  live: 'structure',
  expired: 'muted',
  accepted: 'success',
};

export const CONSENT_SOURCE_LABELS: Record<ParentalConsentSource, string> = {
  STAFF_ATTESTATION: 'Staff du club',
  GUARDIAN_IN_APP: "Parent, dans l'app",
};

export function eventTitle(event: Pick<AdminEventSummary, 'type' | 'opponentName'>): string {
  if (event.type === 'TRAINING') return 'Entraînement';
  return event.opponentName ? `Match · ${event.opponentName}` : 'Match';
}
