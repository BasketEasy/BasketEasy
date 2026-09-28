// Back-office support actions: named, reason-carrying writes staff make on a
// club's behalf. Every one is audited as ADMIN_SUPPORT_ACTION with the action
// in `metadata.action` and the reason in `metadata.reason`.
// Part spec: docs/superpowers/specs/2026-09-28-backoffice-v2-part5-support-actions.md.

import type { ClubRole } from './club-members';

export type AdminSupportActionKind =
  | 'RESEND_VERIFICATION'
  | 'MARK_EMAIL_VERIFIED'
  | 'SEND_PASSWORD_RESET'
  | 'REVOKE_SESSIONS'
  | 'CHANGE_CLUB_ROLE'
  | 'REMOVE_MEMBERSHIP'
  | 'ADD_TEAM_ADMIN'
  | 'REMOVE_TEAM_ADMIN'
  | 'TRANSFER_TEAM_OWNERSHIP'
  | 'RETRY_OCR'
  | 'CANCEL_GUARDIAN_INVITE'
  | 'REMOVE_GUARDIAN'
  | 'RECORD_PARENTAL_CONSENT'
  | 'CLUB_CREATED'
  | 'CLUB_DELETED';

export const ADMIN_SUPPORT_ACTION_KINDS: readonly AdminSupportActionKind[] = [
  'RESEND_VERIFICATION',
  'MARK_EMAIL_VERIFIED',
  'SEND_PASSWORD_RESET',
  'REVOKE_SESSIONS',
  'CHANGE_CLUB_ROLE',
  'REMOVE_MEMBERSHIP',
  'ADD_TEAM_ADMIN',
  'REMOVE_TEAM_ADMIN',
  'TRANSFER_TEAM_OWNERSHIP',
  'RETRY_OCR',
  'CANCEL_GUARDIAN_INVITE',
  'REMOVE_GUARDIAN',
  'RECORD_PARENTAL_CONSENT',
  'CLUB_CREATED',
  'CLUB_DELETED',
];

export const ADMIN_REASON_MIN_LENGTH = 10;
export const ADMIN_REASON_MAX_LENGTH = 500;

/** Every support action carries one; an audited write with no justification is the gap. */
export interface AdminReasonRequest {
  reason: string;
}

export interface ChangeClubRoleRequest extends AdminReasonRequest {
  role: ClubRole;
}

export interface AddTeamAdminRequest extends AdminReasonRequest {
  userId: string;
}

export interface TransferTeamOwnershipRequest extends AdminReasonRequest {
  /** Must already be linked to the team. */
  clubId: string;
}

export interface RecordConsentRequest extends AdminReasonRequest {
  /** Who gave it, e.g. « Nicolas Bernard, père ». */
  givenBy: string;
  /** How it reached Kluvo, e.g. « formulaire papier reçu par e-mail ». */
  method: string;
}

export interface AdminActionResult {
  action: AdminSupportActionKind;
  auditLogId: string;
}

/**
 * A sheet still queued or being read after this long is stuck, and may be
 * retried. Before it, a retry would race the read already running.
 */
export const ADMIN_OCR_STUCK_AFTER_MS = 60 * 60 * 1000;

/** Creates a club and makes an existing account its first ADMIN, in one audited step. */
export interface AdminCreateClubRequest extends AdminReasonRequest {
  name: string;
  ffbbClubCode?: string;
  firstAdminUserId: string;
}

export interface AdminCreateClubResult extends AdminActionResult {
  clubId: string;
}
