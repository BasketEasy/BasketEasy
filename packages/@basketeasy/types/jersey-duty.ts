import type { EventLogisticsAssignee, EventRsvpRespondent } from './events';
import type { Gender } from './teams';

export type JerseyDutyStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ACCEPTED' | 'DONE' | 'VOIDED';

/** On every MATCH `TeamEvent` of a team with the rotation on; null otherwise. */
export interface EventJerseyDutySummary {
  holder: EventLogisticsAssignee | null;
  status: JerseyDutyStatus;
  /** The previous MATCH's washer (non-voided): who brings the set to this match. */
  broughtBy: EventLogisticsAssignee | null;
  /** The acting persona holds it (the reader, or the child they act for). */
  isMine: boolean;
}

export interface JerseyDutyCandidate extends EventLogisticsAssignee {
  turnsThisSeason: number;
  lastTurnAt: string | null;
}

export interface JerseyDutyPerson extends JerseyDutyCandidate {
  /** The player's gender, for copy that agrees with them; the client falls back to `teamGender`. */
  gender: Gender | null;
  /**
   * An account or a guardian can be told: false means « Personne ne sera prévenu ».
   * Decided on the server and meaningful to a manager only: every other reader gets
   * `true`, so the event audience can't tell which teammates have an account.
   */
  reachable: boolean;
}

export interface JerseyDutyDetail {
  eventId: string;
  teamGender: Gender;
  /** `startsAt` has passed: only a manager changes anything. */
  locked: boolean;
  status: JerseyDutyStatus;
  holder: JerseyDutyPerson | null;
  /** The caller who accepted (never the persona): « Accepté par Sophie M. ». */
  acceptedBy: EventRsvpRespondent | null;
  broughtBy: EventLogisticsAssignee | null;
  suggestion:
    | {
        kind: 'SUGGESTED';
        candidate: JerseyDutyPerson;
        /** Strictly fewer turns than every other pool member. */
        isFewest: boolean;
      }
    | { kind: 'EMPTY_POOL' }
    | { kind: 'AFTER_PREVIOUS'; previousMatchStartsAt: string }
    | null;
  /** Convoked and GOING, exemptions included. */
  pool: { convokedGoingCount: number; exemptedCount: number };
  /** Swap targets in suggestion order, the acting persona excluded. Empty unless `rights.canSwap`. */
  swapCandidates: JerseyDutyCandidate[];
  pendingSwap: { to: EventLogisticsAssignee; requestedAt: string } | null;
  /** The team's next MATCH after this one, when the set must come back. */
  nextMatchStartsAt: string | null;
  rights: {
    canAccept: boolean;
    canDecline: boolean;
    canSwap: boolean;
    canCancelSwap: boolean;
    canRespondToSwap: boolean;
    /** Team manager, and not acting for a child. */
    canManage: boolean;
  };
}

export interface JerseyRotationRow extends JerseyDutyCandidate {
  /** `Player.id`: the key of `PATCH …/players/:playerId` (the exemption toggle). */
  playerId: string;
  exempt: boolean;
  /** The acting persona. */
  isMe: boolean;
}

export interface JerseyRotationOverview {
  seasonYear: number;
  teamGender: Gender;
  enabled: boolean;
  /** Team manager, and not acting for a child: shows the toggles. */
  canManage: boolean;
  nextMatch: {
    eventId: string;
    startsAt: string;
    holder: EventLogisticsAssignee | null;
    suggestion: EventLogisticsAssignee | null;
  } | null;
  /** Suggestion order, exempted rows last. */
  rows: JerseyRotationRow[];
}

export interface AssignJerseyDutyRequest {
  /** Null clears the duty. */
  teamPlayerId: string | null;
}

export interface ProposeJerseySwapRequest {
  teamPlayerId: string;
}

export const JERSEY_DUTY_ERROR_CODES = {
  LOCKED: 'JERSEY_DUTY_LOCKED',
  NOT_STARTED: 'JERSEY_DUTY_NOT_STARTED',
  ROTATION_DISABLED: 'JERSEY_ROTATION_DISABLED',
  USE_JERSEY_DUTY: 'USE_JERSEY_DUTY',
} as const;
