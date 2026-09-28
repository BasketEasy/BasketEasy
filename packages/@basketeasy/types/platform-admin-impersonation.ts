import type { AdminReasonRequest } from './platform-admin-actions';

/**
 * Read-only impersonation: a DATA_OFFICER viewing the product as another user.
 * Design record: docs/superpowers/specs/2026-09-28-backoffice-impersonation-design.md.
 */

/**
 * The `scope` claim of an impersonation token. Signed with the same
 * PLATFORM_JWT_SECRET as the step-up token, so this claim is what keeps the
 * two apart: the product accepts only this one, the back-office only its own.
 */
export const IMPERSONATION_TOKEN_SCOPE = 'impersonation-readonly';

/** The 403 code a write carrying an impersonation token gets, so the client doesn't treat it as expiry. */
export const IMPERSONATION_READ_ONLY_CODE = 'IMPERSONATION_READ_ONLY';

/** How long one session lasts. Never refreshed. */
export const IMPERSONATION_TTL_SECONDS = 15 * 60;

export type StartImpersonationRequest = AdminReasonRequest;

export interface StartImpersonationResponse {
  sessionId: string;
  /** Sent as `Authorization: Bearer` on product calls while the session lasts. Keep it in memory only. */
  token: string;
  expiresAt: string;
  subject: {
    id: string;
    /** Redacted for the caller's role, like every person in a back-office response. */
    displayName: string;
  };
}
