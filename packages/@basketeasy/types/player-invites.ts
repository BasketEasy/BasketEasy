// A one-time link an admin generates to invite a player (who has no account
// yet) to sign up and get linked to their own Player record — see
// server/src/invites and CLAUDE.md's Player invites section.

export interface PlayerInviteLink {
  /** The raw token, shown once at generation time — never retrievable again. */
  token: string;
  /** Full URL (frontend origin + /invite/:token) ready to copy and send. */
  url: string;
  expiresAt: string;
}

export type PlayerInviteState = 'NONE' | 'PENDING' | 'EXPIRED' | 'ACCEPTED';

export interface PlayerInviteStatus {
  status: PlayerInviteState;
  expiresAt: string | null;
}

export interface PlayerInvitePreview {
  playerFirstName: string;
  playerLastName: string;
  clubName: string;
}

export interface AcceptPlayerInviteRequest {
  email: string;
  password: string;
}

/**
 * `ApiError.code` on the 409 thrown when an invite token was valid and is
 * being reused after it was already accepted — lets the frontend say "you
 * already have an account, log in" instead of the generic invalid/expired
 * message. Deliberately not thrown for an unknown or merely-expired token:
 * only "already accepted" requires the token to have existed and been valid
 * at some point, so adding a code there (and nowhere else) doesn't turn the
 * generic 404 into a way to distinguish "never existed" from "expired".
 */
export const INVITE_ALREADY_ACCEPTED_CODE = 'INVITE_ALREADY_ACCEPTED';
