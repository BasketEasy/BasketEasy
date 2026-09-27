// Parents (or other legal guardians) acting for a player — see
// docs/superpowers/specs/2026-09-27-parent-guardian-design.md. A guardian is a
// user linked to a player through an admin-issued invite; being one is a
// derived state, never a club role.

import type { Gender } from './teams';

/** Most parents one player can have linked at once. */
export const MAX_GUARDIANS_PER_PLAYER = 4;

/**
 * Carried by a 400 on accepting a guardian invite when the refusal is a
 * finished French sentence meant for the parent (following oneself, a fifth
 * parent). Any other 400 there is input validation and not shown verbatim.
 */
export const GUARDIAN_INVITE_REFUSED_CODE = 'GUARDIAN_INVITE_REFUSED';
/** Most unused, unexpired invite links one player can have outstanding. */
export const MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER = 4;

export type ParentalConsentSource = 'STAFF_ATTESTATION' | 'GUARDIAN_IN_APP';

// ── Admin: a player's guardians ─────────────────────────────────────────────

export interface PlayerGuardianSummary {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  /** Admin view only: the admin needs to tell two parents apart. */
  email: string;
  linkedAt: string;
  /** This guardian's own in-app consent for this player, if they gave one. */
  consentGivenAt: string | null;
}

export interface PendingGuardianInvite {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface PlayerGuardians {
  guardians: PlayerGuardianSummary[];
  pendingInvites: PendingGuardianInvite[];
}

export interface GuardianInviteLink {
  id: string;
  /** The raw token, shown once at generation time — never retrievable again. */
  token: string;
  /** Full URL (frontend origin + /guardian-invite/:token) ready to copy and send. */
  url: string;
  expiresAt: string;
}

// ── Public: the invite page ─────────────────────────────────────────────────

export interface GuardianInvitePreview {
  playerFirstName: string;
  playerLastName: string;
  clubName: string;
  teamNames: string[];
  /**
   * The child is a minor, so accepting records the parent's consent and
   * cannot happen without it. False for an adult, and for an unknown birth
   * date (a consent record snapshots the birth date).
   */
  requiresConsent: boolean;
  expiresAt: string;
}

export interface AcceptGuardianInviteRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  consent?: boolean;
}

export interface AcceptGuardianInviteAsMeRequest {
  consent?: boolean;
}

export interface AcceptedGuardianInvite {
  playerId: string;
  clubId: string;
}

// ── Me: personas, children, who follows me ──────────────────────────────────

export interface PersonaTeam {
  teamId: string;
  teamName: string;
}

export interface SelfPersona {
  /** Events in the next 14 days on the caller's own teams they haven't answered. */
  pendingCount: number;
  /** The caller's own Player rows (one per club they play in); empty for a non-player. */
  playerIds: string[];
}

export interface ChildPersona {
  playerId: string;
  firstName: string;
  lastName: string;
  clubId: string;
  clubName: string;
  teams: PersonaTeam[];
  /** Events in the next 14 days on the child's teams the child has no answer for. */
  pendingCount: number;
}

export interface MyPersonas {
  /** Null for a guardian-only user: no membership, no team admin grant, no roster slot. */
  self: SelfPersona | null;
  children: ChildPersona[];
}

export interface GuardianName {
  firstName: string | null;
  lastName: string | null;
}

export interface MyChildProfile {
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: Gender | null;
  isMinor: boolean;
  clubId: string;
  clubName: string;
  teams: PersonaTeam[];
  /** The child's other guardians — names only, never e-mails, never the caller. */
  coGuardians: GuardianName[];
  /** The most recent parental-consent record for the child, if any. */
  consent: {
    consentGivenAt: string;
    attestedByName: string;
    source: ParentalConsentSource;
  } | null;
}

/** The four fields a parent may correct; licence fields and teams stay admin-only. */
export interface UpdateMyChildRequest {
  firstName?: string;
  lastName?: string;
  birthDate?: string | null;
  gender?: Gender | null;
}

export interface MyPlayerGuardian extends GuardianName {
  userId: string;
  linkedAt: string;
}

export interface MyPlayerGuardians {
  playerId: string;
  /** A minor can see who follows them but can't remove anyone. */
  isMinor: boolean;
  guardians: MyPlayerGuardian[];
}
