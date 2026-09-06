// The platform back-office: a tightly-scoped internal surface for handling
// RGPD access/erasure requests and confirming the retention sweep runs.
// Design record: docs/superpowers/specs/2026-09-06-backoffice-design.md.
//
// Nothing here is club-scoped. Authority comes from a PlatformAdmin grant
// provisioned out-of-band, and every route additionally requires a
// short-lived step-up token minted from a TOTP code — holding the grant is
// necessary but not sufficient.

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

/**
 * One row of the redacted list of accounts nearing the inactivity cutoff.
 * Deliberately carries no local-part, no name and no club names — opening
 * one specific record is the audited ADMIN_PII_VIEWED moment, and a list
 * view that already showed the person would make that audit trail a lie.
 */
export interface RedactedUserSummary {
  id: string;
  /** e.g. `gmail.com`. Distinguishes a real volunteer from a test account without identifying anybody. */
  emailDomain: string;
  lastActiveAt: string;
  /** Negative once the 12-month cutoff has already passed and the sweep has not yet run. */
  daysUntilErasure: number;
  clubCount: number;
}

export type PlatformUserListStatus = 'inactive-soon';

export interface ListPlatformUsersParams {
  status?: PlatformUserListStatus;
  page?: number;
  pageSize?: number;
}

/** The full record, returned only to a DATA_OFFICER and only per open. */
export interface PlatformUserDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  lastActiveAt: string;
  createdAt: string;
  clubs: { id: string; name: string; role: 'ADMIN' | 'MEMBER' }[];
  /** Roster entries the account is linked to. Erasure unlinks these, it never deletes them. */
  linkedPlayers: { id: string; firstName: string; lastName: string; clubName: string }[];
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
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'
  | 'ADMIN_PII_VIEWED'
  | 'ADMIN_USER_ERASED'
  | 'ADMIN_EXPORT_GENERATED';

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
  page?: number;
  pageSize?: number;
}

/**
 * One step of the retention sweep. `count` is what the step did, or — on a
 * dry run — what it would have done.
 */
export interface RetentionStepSummary {
  step: string;
  count: number;
  error: string | null;
}

export interface RetentionRunSummary {
  id: string;
  dryRun: boolean;
  ranAt: string;
  triggeredByUserId: string | null;
  steps: RetentionStepSummary[];
}
