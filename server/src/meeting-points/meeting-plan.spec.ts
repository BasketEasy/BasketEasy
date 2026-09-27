import { floorToQuarterHour } from '@basketeasy/types/meeting-points';
import {
  isTravelStale as isTravelStaleFor,
  normaliseAddress,
  resolveMeetingPlan as resolveMeetingPlanFor,
  travelRouteKey,
  type MeetingPlanClub,
  type MeetingPlanEvent,
  type MeetingPlanState,
  type MeetingPlanTeam,
} from './meeting-plan';

type MatchFixture = MeetingPlanEvent & MeetingPlanState;

function split({ type, startsAt, location, ...state }: MatchFixture) {
  return [{ type, startsAt, location }, state] as const;
}

function resolveMeetingPlan(
  fixture: MatchFixture,
  team: MeetingPlanTeam,
  club: MeetingPlanClub | null,
) {
  const [event, state] = split(fixture);
  return resolveMeetingPlanFor(event, state, team, club);
}

function isTravelStale(fixture: MatchFixture, team: MeetingPlanTeam, club: MeetingPlanClub | null) {
  const [event, state] = split(fixture);
  return isTravelStaleFor(event, state, team, club);
}

const club: MeetingPlanClub = {
  meetingPointName: 'Parking club',
  meetingPointAddress: '1 rue du Club, Nantes',
  arrivalBufferMinutes: 45,
};
const team: MeetingPlanTeam = {
  meetingPointName: null,
  meetingPointAddress: null,
  arrivalBufferMinutes: null,
};

function match(overrides: Partial<MatchFixture> = {}): MatchFixture {
  return {
    type: 'MATCH',
    // 20:30 Europe/Paris in winter
    startsAt: new Date('2026-01-10T19:30:00.000Z'),
    location: 'Salle Coubertin, Rezé',
    meetingPointName: null,
    meetingPointAddress: null,
    travelMinutes: null,
    travelMinutesManual: false,
    travelRouteKey: null,
    meetsAtOverride: null,
    ...overrides,
  };
}

const clubRoute = travelRouteKey('1 rue du Club, Nantes', 'Salle Coubertin, Rezé');

describe('travelRouteKey', () => {
  it('is a fixed-width versioned hash, equal for equivalent addresses', () => {
    expect(clubRoute).toMatch(/^v1:[0-9a-f]{40}$/);
    expect(travelRouteKey(' 1 RUE du club,  Nantes', 'salle coubertin, rezé')).toBe(clubRoute);
  });

  it('does not confuse origin and destination', () => {
    expect(travelRouteKey('a', 'b')).not.toBe(travelRouteKey('b', 'a'));
  });
});

describe('normaliseAddress', () => {
  it('ignores case and repeated whitespace', () => {
    expect(normaliseAddress('  Salle  Coubertin,\tNANTES ')).toBe(
      normaliseAddress('salle coubertin, nantes'),
    );
  });
});

describe('floorToQuarterHour', () => {
  it('rounds down, never up', () => {
    expect(floorToQuarterHour(new Date('2026-01-10T18:22:59.000Z')).toISOString()).toBe(
      '2026-01-10T18:15:00.000Z',
    );
    expect(floorToQuarterHour(new Date('2026-01-10T18:15:00.000Z')).toISOString()).toBe(
      '2026-01-10T18:15:00.000Z',
    );
  });
});

describe('resolveMeetingPlan', () => {
  it('is null for a training', () => {
    expect(resolveMeetingPlan(match({ type: 'TRAINING' }), team, club)).toBeNull();
  });

  it('computes the design doc example: 20:30, 45 min, 23 min drive → 19:15', () => {
    const plan = resolveMeetingPlan(
      match({ travelMinutes: 23, travelRouteKey: clubRoute }),
      team,
      club,
    );
    expect(plan).toEqual({
      arrivalAt: '2026-01-10T18:45:00.000Z',
      arrivalBufferMinutes: 45,
      meetingPoint: { name: 'Parking club', address: '1 rue du Club, Nantes' },
      meetingPointSource: 'CLUB',
      defaultMeetingPoint: { name: 'Parking club', address: '1 rue du Club, Nantes' },
      defaultMeetingPointSource: 'CLUB',
      travelMinutes: 23,
      travelMinutesSource: 'COMPUTED',
      meetsAt: '2026-01-10T18:15:00.000Z',
      meetsAtSource: 'COMPUTED',
    });
  });

  it('prefers the event override, then the team default, over the club default', () => {
    const teamWithPlace = { ...team, meetingPointName: 'Team', meetingPointAddress: 'T' };
    expect(resolveMeetingPlan(match(), teamWithPlace, club)?.meetingPointSource).toBe('TEAM');
    expect(
      resolveMeetingPlan(
        match({ meetingPointName: 'Event', meetingPointAddress: 'E' }),
        teamWithPlace,
        club,
      )?.meetingPoint,
    ).toEqual({ name: 'Event', address: 'E' });
  });

  it('names the default an event override replaces', () => {
    const plan = resolveMeetingPlan(
      match({ meetingPointName: 'Event', meetingPointAddress: 'E' }),
      team,
      club,
    );
    expect(plan?.defaultMeetingPoint).toEqual({
      name: 'Parking club',
      address: '1 rue du Club, Nantes',
    });
    expect(plan?.defaultMeetingPointSource).toBe('CLUB');
  });

  it('reads a match with no stored meeting row as « à confirmer »', () => {
    const plan = resolveMeetingPlanFor(
      { type: 'MATCH', startsAt: new Date('2026-01-10T19:30:00.000Z'), location: 'x' },
      null,
      team,
      club,
    );
    expect(plan).toMatchObject({ meetingPointSource: 'CLUB', travelMinutes: null, meetsAt: null });
  });

  it("uses the team's buffer over the club's", () => {
    const plan = resolveMeetingPlan(match(), { ...team, arrivalBufferMinutes: 60 }, club);
    expect(plan?.arrivalBufferMinutes).toBe(60);
    expect(plan?.arrivalAt).toBe('2026-01-10T18:30:00.000Z');
  });

  it('still gives an arrival time with no meeting point configured anywhere', () => {
    const plan = resolveMeetingPlan(match(), team, null);
    expect(plan).toMatchObject({
      arrivalAt: '2026-01-10T18:45:00.000Z',
      arrivalBufferMinutes: 45,
      meetingPoint: null,
      meetsAt: null,
    });
  });

  it('treats minutes computed for another route as unknown («à confirmer»)', () => {
    const plan = resolveMeetingPlan(
      match({ travelMinutes: 23, travelRouteKey: travelRouteKey('ancien parking', 'x') }),
      team,
      club,
    );
    expect(plan?.travelMinutes).toBeNull();
    expect(plan?.meetsAt).toBeNull();
  });

  it('labels typed minutes as manual', () => {
    const plan = resolveMeetingPlan(
      match({ travelMinutes: 30, travelMinutesManual: true, travelRouteKey: clubRoute }),
      team,
      club,
    );
    expect(plan?.travelMinutesSource).toBe('MANUAL');
    expect(plan?.meetsAt).toBe('2026-01-10T18:15:00.000Z');
  });

  it('lets a time override win even with no travel time known', () => {
    const plan = resolveMeetingPlan(
      match({ meetsAtOverride: new Date('2026-01-10T17:00:00.000Z') }),
      team,
      club,
    );
    expect(plan?.meetsAt).toBe('2026-01-10T17:00:00.000Z');
    expect(plan?.meetsAtSource).toBe('OVERRIDE');
  });

  it('gives a zero-minute home match its arrival time, floored', () => {
    const plan = resolveMeetingPlan(
      match({ travelMinutes: 0, travelRouteKey: clubRoute }),
      team,
      club,
    );
    expect(plan?.meetsAt).toBe('2026-01-10T18:45:00.000Z');
  });
});

describe('isTravelStale', () => {
  it('is stale when never computed or computed for another route', () => {
    expect(isTravelStale(match(), team, club)).toBe(true);
    expect(isTravelStale(match({ travelRouteKey: 'other' }), team, club)).toBe(true);
  });

  it('is fresh when computed for the current route, even with an unknown answer', () => {
    expect(isTravelStale(match({ travelRouteKey: clubRoute }), team, club)).toBe(false);
  });

  it('is never stale without a meeting point, or for a training', () => {
    expect(isTravelStale(match(), team, null)).toBe(false);
    expect(isTravelStale(match({ type: 'TRAINING' }), team, club)).toBe(false);
  });
});
