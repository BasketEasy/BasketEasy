// E-mail verification and password reset: the two flows that reach a user
// through their inbox rather than through a session.
//
// Every one of these endpoints answers 204 with no body, deliberately. A
// password-reset request must not reveal whether an address has an account
// (user enumeration), and once that is true for one endpoint it is simpler
// and safer for the whole set to say nothing back.

export interface ConfirmEmailRequest {
  token: string;
}

export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/**
 * `ApiError.code` on the 403 thrown by EmailVerifiedGuard, so the frontend can
 * tell "you may not do this" from "confirm your address first" and offer the
 * resend button instead of a dead end.
 */
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';
