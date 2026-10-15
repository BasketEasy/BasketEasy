// Browsing the club graph from the platform back-office: clubs, teams,
// users, players, events and scoresheets, each linked to the others.
// Decisions: docs/decisions/rgpd-and-backoffice.md.
//
// Every person in these payloads is an `AdminPersonRef`, built once on the
// server for the caller's platform role. A SUPPORT caller never receives a
// name or an e-mail local part: redaction is decided server-side, never by a
// client hiding a field it was sent.

import type { ClubRole } from './club-members';
import type { EventRsvpStatus, EventScoresheetStatus, EventType, EventVenue } from './events';
import type { ParentalConsentSource } from './guardians';
import type { PlatformRole } from './platform-admin';
import type { Gender, TeamCategory, TeamMemberRole } from './teams';

export interface AdminPersonRef {
  kind: 'user' | 'player';
  id: string;
  /** DATA_OFFICER: "Jean Dupont" (or the e-mail when no name is set). SUPPORT: "J. D.", or "—". */
  displayName: string;
  /** DATA_OFFICER only. Null for SUPPORT and for a player with no linked account. */
  email: string | null;
  /** Both roles: the domain alone identifies nobody. */
  emailDomain: string | null;
  redacted: boolean;
}

export interface AdminClubRef {
  id: string;
  name: string;
}

export interface AdminTeamRef {
  id: string;
  name: string;
  category: TeamCategory;
  gender: Gender;
}

/** Booleans travel in the query string as text. */
export type AdminBooleanParam = 'true' | 'false';

interface AdminPageParams {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------- clubs

export interface AdminClubSummary extends AdminClubRef {
  ffbbClubCode: string | null;
  createdAt: string;
  memberCount: number;
  adminCount: number;
  teamCount: number;
  playerCount: number;
}

export interface AdminClubDetail extends AdminClubSummary {
  meetingPointName: string | null;
  meetingPointAddress: string | null;
  arrivalBufferMinutes: number;
}

export interface AdminClubMember {
  person: AdminPersonRef;
  role: ClubRole;
  joinedAt: string;
}

export interface AdminClubsQuery extends AdminPageParams {
  /** Club name (substring) or FFBB club code (exact). */
  q?: string;
  hasAdmin?: AdminBooleanParam;
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
}

export interface AdminClubMembersQuery extends AdminPageParams {
  role?: ClubRole;
}

// ---------------------------------------------------------------- teams

export interface AdminTeamSummary extends AdminTeamRef {
  createdAt: string;
  /** Null only if the data is inconsistent (no owning club), which the UI shows as such. */
  ownerClub: AdminClubRef | null;
  partnerClubs: AdminClubRef[];
  rosterCount: number;
  teamAdminCount: number;
}

export interface AdminTeamDetail extends AdminTeamSummary {
  teamAdmins: { person: AdminPersonRef; grantedAt: string }[];
  ffbbLinks: { id: string; engagementRef: string; label: string | null }[];
}

export interface AdminRosterEntry {
  teamPlayerId: string;
  player: AdminPersonRef;
  club: AdminClubRef;
  role: TeamMemberRole;
  linkedUser: AdminPersonRef | null;
  joinedAt: string;
}

export interface AdminTeamsQuery extends AdminPageParams {
  q?: string;
  clubId?: string;
  category?: TeamCategory;
  gender?: Gender;
  /** Whether anyone holds a TeamAdmin grant on the team. Club ADMINs are not counted. */
  hasAdmin?: AdminBooleanParam;
}

// ---------------------------------------------------------------- users

export interface AdminUserSummary {
  person: AdminPersonRef;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
  /** Negative once the 12-month cutoff has passed and the sweep has not yet run. */
  daysUntilErasure: number;
  clubCount: number;
  guardianOfCount: number;
  platformRole: PlatformRole | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  memberships: { club: AdminClubRef; role: ClubRole; joinedAt: string }[];
  teamAdminOf: { team: AdminTeamRef; grantedAt: string }[];
  /** Roster entries the account is linked to. Erasure unlinks these, it never deletes them. */
  linkedPlayers: { player: AdminPersonRef; club: AdminClubRef; teams: AdminTeamRef[] }[];
  guardianOf: { player: AdminPersonRef; club: AdminClubRef; linkedAt: string }[];
  activeSessionCount: number;
}

export interface AdminUsersQuery extends AdminPageParams {
  /** DATA_OFFICER: name or e-mail substring. SUPPORT: exact e-mail only. */
  q?: string;
  clubId?: string;
  teamId?: string;
  clubRole?: ClubRole;
  verified?: AdminBooleanParam;
  /** Accounts within a month of the 12-month inactivity cutoff, or past it. */
  inactiveSoon?: AdminBooleanParam;
  isGuardian?: AdminBooleanParam;
  hasPlatformRole?: AdminBooleanParam;
  sort?: 'createdAt' | 'lastActiveAt';
  order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------- players

export type AdminConsentState = 'not-required' | 'recorded' | 'missing' | 'unknown';

export type AdminInviteState = 'live' | 'expired' | 'accepted';

export interface AdminPlayerSummary {
  person: AdminPersonRef;
  club: AdminClubRef;
  linkedUserId: string | null;
  /** Null when no birth date is known. */
  isMinor: boolean | null;
  consentState: AdminConsentState;
  teamCount: number;
  createdAt: string;
}

export interface AdminPlayerDetail extends AdminPlayerSummary {
  /** DATA_OFFICER only. */
  birthDate: string | null;
  /** DATA_OFFICER only. */
  licenseNumber: string | null;
  gender: Gender | null;
  linkedUser: AdminPersonRef | null;
  teams: { teamPlayerId: string; team: AdminTeamRef; role: TeamMemberRole }[];
  guardians: { person: AdminPersonRef; linkedAt: string }[];
  guardianInvites: { id: string; createdAt: string; expiresAt: string; state: AdminInviteState }[];
  playerInvite: { createdAt: string; expiresAt: string; state: AdminInviteState } | null;
  consents: {
    id: string;
    source: ParentalConsentSource;
    /** Redacted to initials for SUPPORT, like any other name. */
    attestedBy: string;
    consentGivenAt: string;
  }[];
}

export interface AdminPlayersQuery extends AdminPageParams {
  /** DATA_OFFICER: name substring. SUPPORT: exact e-mail of the linked account only. */
  q?: string;
  clubId?: string;
  teamId?: string;
  claimed?: AdminBooleanParam;
  minor?: AdminBooleanParam;
  /** Minors with no consent on record. */
  missingConsent?: AdminBooleanParam;
}

// ---------------------------------------------------------------- events

export interface AdminScoresheetSummary {
  id: string;
  event: { id: string; startsAt: string; opponentName: string | null };
  team: AdminTeamRef;
  status: EventScoresheetStatus;
  /** Null before the first extraction row exists. */
  attemptCount: number | null;
  failureReason: string | null;
  uploadedAt: string;
}

export interface AdminEventSummary {
  id: string;
  team: AdminTeamRef;
  type: EventType;
  startsAt: string;
  location: string;
  opponentName: string | null;
  rsvpCounts: { going: number; notGoing: number; maybe: number };
  convocationCount: number;
  scoresheetStatus: EventScoresheetStatus | null;
}

export interface AdminEventDetail extends AdminEventSummary {
  venue: EventVenue | null;
  notes: string | null;
  recurrenceId: string | null;
  roster: {
    teamPlayerId: string;
    player: AdminPersonRef;
    role: TeamMemberRole;
    rsvp: EventRsvpStatus | null;
    respondedBy: AdminPersonRef | null;
    convoked: boolean;
  }[];
  scoresheet: AdminScoresheetSummary | null;
}

export interface AdminEventsQuery extends AdminPageParams {
  clubId?: string;
  teamId?: string;
  type?: EventType;
  /** ISO 8601, inclusive. */
  from?: string;
  /** ISO 8601, exclusive. */
  to?: string;
  scoresheetStatus?: EventScoresheetStatus;
}

export interface AdminScoresheetsQuery extends AdminPageParams {
  /** Comma-separated list, e.g. `FAILED,NEEDS_REVIEW`. */
  status?: string;
  clubId?: string;
  from?: string;
  to?: string;
}
