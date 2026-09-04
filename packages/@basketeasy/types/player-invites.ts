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
