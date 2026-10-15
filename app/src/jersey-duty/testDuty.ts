import type { JerseyDutyDetail, JerseyDutyPerson } from '@basketeasy/types/jersey-duty';

export const emma: JerseyDutyPerson = {
  teamPlayerId: 'tp-emma',
  firstName: 'Emma',
  lastName: 'Martin',
  turnsThisSeason: 1,
  lastTurnAt: null,
  gender: 'WOMEN',
  reachable: true,
};

export const ines = {
  teamPlayerId: 'tp-ines',
  firstName: 'Inès',
  lastName: 'Bernard',
  turnsThisSeason: 0,
  lastTurnAt: null,
};

export function dutyDetail(overrides: Partial<JerseyDutyDetail> = {}): JerseyDutyDetail {
  const { rights, ...rest } = overrides;
  return {
    eventId: 'event-1',
    teamGender: 'WOMEN',
    locked: false,
    status: 'UNASSIGNED',
    holder: null,
    acceptedBy: null,
    broughtBy: { teamPlayerId: 'tp-lucas', firstName: 'Lucas', lastName: 'Dupuis' },
    suggestion: null,
    pool: { convokedGoingCount: 8, exemptedCount: 1 },
    swapCandidates: [],
    pendingSwap: null,
    nextMatchStartsAt: '2026-10-11T12:00:00.000Z',
    rights: {
      canAccept: false,
      canDecline: false,
      canSwap: false,
      canCancelSwap: false,
      canRespondToSwap: false,
      canManage: false,
      ...rights,
    },
    ...rest,
  };
}
