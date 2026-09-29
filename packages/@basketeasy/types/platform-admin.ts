// The platform back-office: a tightly-scoped internal surface for handling
// RGPD access/erasure requests and confirming the retention sweep runs.
// Design record: docs/superpowers/specs/2026-09-06-backoffice-design.md.
//
// Nothing here is club-scoped. Authority comes from a PlatformAdmin grant
// provisioned out-of-band, and every route additionally requires a
// short-lived step-up token minted from a TOTP code — holding the grant is
// necessary but not sufficient.

import type { ParentalConsentSource } from './guardians';
import type { AdminSupportActionKind } from './platform-admin-actions';

export type PlatformRole = 'SUPPORT' | 'DATA_OFFICER';

/**
 * `ApiError.code` on the 403 thrown when the caller holds a grant but no
 * valid step-up token (never presented one, or it expired — they are minted
 * for 15 minutes and never refreshed). The admin shell drops its token and
 * re-prompts for a TOTP code instead of showing a dead end.
 */
export const PLATFORM_STEP_UP_REQUIRED_CODE = 'PLATFORM_STEP_UP_REQUIRED';

/**
 * `ApiError.code` on the 403 for a grant locked out by repeated failed TOTP
 * attempts. Distinct from the above because re-prompting for a code is
 * exactly the wrong response — only an operator can clear it.
 */
export const PLATFORM_ADMIN_LOCKED_CODE = 'PLATFORM_ADMIN_LOCKED';

/**
 * The header the step-up token travels in. It cannot ride `Authorization`,
 * which already carries the ordinary access token: both credentials are
 * required on every /admin/* request.
 */
export const PLATFORM_TOKEN_HEADER = 'x-platform-token';

export interface PlatformLoginRequest {
  /** Six-digit RFC 6238 code from the admin's authenticator app. */
  totpCode: string;
}

export interface PlatformLoginResponse {
  platformAccessToken: string;
  /** ISO timestamp. The client re-prompts rather than refreshing. */
  expiresAt: string;
  role: PlatformRole;
}

export interface ErasePlatformUserRequest {
  /** Free text, stored in the ADMIN_USER_ERASED audit row. A manual erasure with no recorded justification is the gap the audit log exists to close. */
  reason: string;
}

export interface ErasePlatformUserResponse {
  erasedUserId: string;
  /** Roster entries left in place with `userId` cleared — a club's history survives the account. */
  unlinkedPlayerCount: number;
}

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  | 'EMAIL_VERIFIED'
  | 'GUARDIAN_INVITE_ACCEPTED'
  | 'GUARDIAN_INVITE_CREATED'
  | 'GUARDIAN_INVITE_CANCELLED'
  | 'GUARDIAN_LINK_REMOVED'
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'
  | 'ADMIN_PII_VIEWED'
  | 'ADMIN_USER_ERASED'
  | 'ADMIN_EXPORT_GENERATED'
  | 'ADMIN_SUPPORT_ACTION'
  | 'ADMIN_IMPERSONATION_STARTED'
  | 'ADMIN_IMPERSONATION_ENDED';

export interface AuditLogEntry {
  id: string;
  type: AuditEventType;
  /** The acting account. For an ADMIN_* row that is the admin, not the data subject. */
  userId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListAuditLogParams {
  /** Matches rows the account *acted on* as well as rows it *acted as* — the question this view answers is "who accessed this person's data". */
  userId?: string;
  /** Matches `metadata.subjectPlayerId`: views of a player record, including one with no account. */
  playerId?: string;
  /** A support action (`metadata.action`); implies ADMIN_SUPPORT_ACTION rows. */
  action?: AdminSupportActionKind;
  page?: number;
  pageSize?: number;
}

/**
 * One step of the retention sweep. `count` is what the step did, or — on a
 * dry run — what it would have done. Mirrors the server's
 * `RetentionStepResult`; the step names are the keys of the `summary` JSON
 * the sweep writes.
 */
export interface RetentionStepSummary {
  step: string;
  status: 'ok' | 'error';
  count: number;
  error: string | null;
}

export interface RetentionRunSummary {
  id: string;
  dryRun: boolean;
  ranAt: string;
  steps: RetentionStepSummary[];
}

export interface ExportPlatformUserRequest {
  /** Same contract as erasure's: recorded in the ADMIN_EXPORT_GENERATED row. An export is a full copy of one person's data leaving the system, and an audit trail that can't say which request it answered is no trail. */
  reason: string;
}

export interface ExportedClubMembership {
  clubName: string;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface ExportedRosterEntry {
  teamName: string;
  clubNames: string[];
  role: 'COACH' | 'PLAYER';
  joinedAt: string;
  rsvps: {
    eventStartsAt: string;
    status: string;
    travelMode: string;
    respondedAt: string;
    /**
     * Who gave the answer, without naming them: `SOMEONE_ELSE` is a guardian
     * answering for this player. Their identity is a third party's data
     * (art. 15(4)). `UNKNOWN` when the responder's account no longer exists
     * or the answer predates the column.
     */
    respondedBy: 'SELF' | 'SOMEONE_ELSE' | 'UNKNOWN';
  }[];
  convocations: { eventStartsAt: string; convokedAt: string }[];
  matchStats: {
    eventStartsAt: string;
    jerseyNumber: number | null;
    points: number | null;
    fouls: number | null;
  }[];
  /**
   * The nominee is deliberately absent (RGPD art. 15(4)): a vote's target is a
   * statement about another player, and peer voting is anonymous by
   * construction. Only the fact that a vote was cast is the subject's own.
   */
  votesCast: { eventStartsAt: string; category: 'BEST' | 'WORST'; castAt: string }[];
  scoresheetUploads: { eventStartsAt: string; uploadedAt: string }[];
  /** "Was down to bring the balls on 14 March" — processing about this person. */
  logisticsAssignments: { eventStartsAt: string; duty: 'JERSEYS' | 'BALLS' }[];
}

export interface ExportedPlayerRecord {
  clubName: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  nationalId: string | null;
  createdAt: string;
  rosterEntries: ExportedRosterEntry[];
}

export interface ExportedAuditEntry {
  type: AuditEventType;
  createdAt: string;
  /** Present only where the subject was the actor. Null on an admin action taken *on* them: they are entitled to know it happened, not to a named staff member. */
  ipAddress: string | null;
  /** False when this row records something an administrator did to them. */
  actedByThisPerson: boolean;
}

/**
 * What this person did as a parent. Their own actions only: a child is named
 * (first and last name, club) so each link and answer is intelligible, but
 * the child's profile, stats and own answers are the child's data, not the
 * parent's (art. 15(4)), and are never included here.
 */
export interface ExportedGuardianActivity {
  children: { firstName: string; lastName: string; clubName: string; linkedAt: string }[];
  invitesAccepted: { childFirstName: string; acceptedAt: string }[];
  /** Answers this person gave on a child's behalf. */
  answersGivenForOthers: {
    childFirstName: string;
    eventStartsAt: string;
    status: string;
    travelMode: string;
    respondedAt: string;
  }[];
}

export interface ExportedParentalConsents {
  /**
   * Consents this person gave or attested — as a parent accepting an invite
   * (`GUARDIAN_IN_APP`) or as club staff (`STAFF_ATTESTATION`). The minor is
   * named; their birth date is left out.
   */
  given: {
    source: ParentalConsentSource;
    clubName: string;
    minorFirstName: string;
    minorLastName: string;
    consentGivenAt: string;
  }[];
  /**
   * Consents recorded for this person while they were a minor. Who gave it is
   * left out: that is the attester's data (art. 15(4)); `source` says whether
   * it was a parent in the app or club staff.
   */
  aboutThisPerson: {
    source: ParentalConsentSource;
    clubName: string;
    consentGivenAt: string;
  }[];
}

/**
 * One data subject's complete record, RGPD art. 15 / art. 20.
 *
 * Self-describing on purpose: `notice` states the legal basis and names the
 * deliberate omissions, so the file still explains itself when it
 * surfaces a year later detached from the request it answered.
 */
export interface PlatformUserExport {
  generatedAt: string;
  subjectUserId: string;
  notice: {
    basis: string;
    omissions: string[];
  };
  account: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
    emailNotificationsEnabled: boolean;
    lastActiveAt: string;
    createdAt: string;
  };
  clubMemberships: ExportedClubMembership[];
  playerRecords: ExportedPlayerRecord[];
  /** Team-level manager grants (TeamAdmin), separate from club roles. */
  teamAdminGrants: { teamName: string; grantedAt: string }[];
  notifications: {
    type: string;
    title: string;
    body: string | null;
    /** On a guardian's copy, the child the notification is about. */
    aboutFirstName: string | null;
    createdAt: string;
  }[];
  guardian: ExportedGuardianActivity;
  parentalConsents: ExportedParentalConsents;
  /** Never the endpoint or its keys — that is a live push capability, not a description of the person. */
  pushSubscriptions: { userAgent: string | null; createdAt: string }[];
  reviewedScoresheets: { eventStartsAt: string; reviewedAt: string }[];
  securityLog: ExportedAuditEntry[];
}
