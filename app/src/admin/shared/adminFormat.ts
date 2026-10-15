import type { ClubRole } from '@basketeasy/types/club-members';
import type { EventScoresheetStatus } from '@basketeasy/types/events';
import type { ParentalConsentSource } from '@basketeasy/types/guardians';
import type {
  AdminConsentState,
  AdminEventSummary,
  AdminInviteState,
  AdminTeamRef,
} from '@basketeasy/types/platform-admin-browse';
import type { AdminSearchKind } from '@basketeasy/types/platform-admin-search';
import type { AdminSupportActionKind } from '@basketeasy/types/platform-admin-actions';
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
  PLATFORM_STAFF: 'Staff Kluvo',
};

export function eventTitle(event: Pick<AdminEventSummary, 'type' | 'opponentName'>): string {
  if (event.type === 'TRAINING') return 'Entraînement';
  return event.opponentName ? `Match · ${event.opponentName}` : 'Match';
}

/** Search groups in the order they are shown; events are found by id only. */
export const SEARCH_GROUPS: { kind: Exclude<AdminSearchKind, 'event'>; label: string }[] = [
  { kind: 'user', label: 'Utilisateurs' },
  { kind: 'player', label: 'Joueurs' },
  { kind: 'club', label: 'Clubs' },
  { kind: 'team', label: 'Équipes' },
];

/** How a support action reads in the audit log and in its success toast. */
export const SUPPORT_ACTION_LABELS: Record<AdminSupportActionKind, string> = {
  RESEND_VERIFICATION: 'Vérification renvoyée',
  MARK_EMAIL_VERIFIED: 'Adresse marquée vérifiée',
  SEND_PASSWORD_RESET: 'Lien de réinitialisation envoyé',
  REVOKE_SESSIONS: 'Sessions révoquées',
  CHANGE_CLUB_ROLE: 'Rôle modifié',
  REMOVE_MEMBERSHIP: 'Retiré du club',
  ADD_TEAM_ADMIN: 'Gestionnaire ajouté',
  REMOVE_TEAM_ADMIN: 'Gestionnaire retiré',
  TRANSFER_TEAM_OWNERSHIP: 'Propriété transférée',
  RETRY_OCR: 'Lecture relancée',
  CANCEL_GUARDIAN_INVITE: 'Invitation annulée',
  REMOVE_GUARDIAN: 'Lien parent retiré',
  RECORD_PARENTAL_CONSENT: 'Autorisation enregistrée',
  CLUB_CREATED: 'Club créé',
  CLUB_DELETED: 'Club supprimé',
};
