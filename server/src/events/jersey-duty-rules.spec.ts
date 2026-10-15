import {
  compareCandidates,
  isCountedTurn,
  isFewestTurns,
  isInPool,
  jerseyDutyStatus,
  orderCandidates,
  planSuggestion,
  type OrderedCandidate,
  type RotationMember,
} from './jersey-duty-rules';

const d = (iso: string) => new Date(iso);

const cand = (over: Partial<OrderedCandidate> & { teamPlayerId: string }): OrderedCandidate => ({
  firstName: 'Anna',
  lastName: 'Martin',
  turns: 0,
  lastTurnAt: null,
  ...over,
});

const member = (over: Partial<RotationMember> = {}): RotationMember => ({
  teamPlayerId: 'tp',
  firstName: 'Anna',
  lastName: 'Martin',
  convoked: true,
  going: true,
  exempt: false,
  declined: false,
  turns: 0,
  lastTurnAt: null,
  ...over,
});

describe('isCountedTurn', () => {
  const season = { start: d('2026-09-01T00:00:00Z'), end: d('2027-08-31T23:59:59.999Z') };
  const now = d('2026-11-01T12:00:00Z');
  const duty = { teamPlayerId: 'tp', voidedAt: null };

  it('counts a started match inside the season', () => {
    expect(isCountedTurn(duty, { startsAt: d('2026-10-04T18:00:00Z') }, now, season)).toBe(true);
  });
  it('does not count a match that has not started', () => {
    expect(isCountedTurn(duty, { startsAt: d('2026-11-08T18:00:00Z') }, now, season)).toBe(false);
  });
  it('counts a match starting exactly now', () => {
    expect(isCountedTurn(duty, { startsAt: now }, now, season)).toBe(true);
  });
  it('does not count a voided turn or an empty holder', () => {
    const startsAt = d('2026-10-04T18:00:00Z');
    expect(isCountedTurn({ ...duty, voidedAt: now }, { startsAt }, now, season)).toBe(false);
    expect(isCountedTurn({ teamPlayerId: null, voidedAt: null }, { startsAt }, now, season)).toBe(
      false,
    );
  });
  it('does not count a match of another season', () => {
    expect(isCountedTurn(duty, { startsAt: d('2026-08-31T18:00:00Z') }, now, season)).toBe(false);
  });
});

describe('isInPool', () => {
  it('requires convoked, going, not exempt, not declined', () => {
    expect(isInPool(member())).toBe(true);
    expect(isInPool(member({ convoked: false }))).toBe(false);
    expect(isInPool(member({ going: false }))).toBe(false);
    expect(isInPool(member({ exempt: true }))).toBe(false);
    expect(isInPool(member({ declined: true }))).toBe(false);
  });
});

describe('suggestion order', () => {
  it('puts fewer turns first', () => {
    expect(
      compareCandidates(cand({ teamPlayerId: 'a', turns: 1 }), cand({ teamPlayerId: 'b' })),
    ).toBe(1);
  });
  it('breaks a turns tie by the longest since last turn, never washed first', () => {
    const ordered = orderCandidates([
      cand({ teamPlayerId: 'recent', turns: 1, lastTurnAt: d('2026-10-11T00:00:00Z') }),
      cand({ teamPlayerId: 'old', turns: 1, lastTurnAt: d('2026-10-04T00:00:00Z') }),
      cand({ teamPlayerId: 'never', turns: 1, lastTurnAt: null }),
    ]);
    expect(ordered.map((c) => c.teamPlayerId)).toEqual(['never', 'old', 'recent']);
  });
  it('breaks a tie by last name, then first name, with accents folded the French way', () => {
    const ordered = orderCandidates([
      cand({ teamPlayerId: '1', lastName: 'Zola', firstName: 'Ana' }),
      cand({ teamPlayerId: '2', lastName: 'Étienne', firstName: 'Zoé' }),
      cand({ teamPlayerId: '3', lastName: 'Étienne', firstName: 'Ana' }),
    ]);
    expect(ordered.map((c) => c.teamPlayerId)).toEqual(['3', '2', '1']);
  });
  it('falls back on the roster id so the order is total', () => {
    const ordered = orderCandidates([cand({ teamPlayerId: 'b' }), cand({ teamPlayerId: 'a' })]);
    expect(ordered.map((c) => c.teamPlayerId)).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const input = [cand({ teamPlayerId: 'b' }), cand({ teamPlayerId: 'a' })];
    orderCandidates(input);
    expect(input[0].teamPlayerId).toBe('b');
  });
});

describe('isFewestTurns', () => {
  it('is true only when strictly fewer than every other member', () => {
    expect(
      isFewestTurns([cand({ teamPlayerId: 'a', turns: 0 }), cand({ teamPlayerId: 'b', turns: 1 })]),
    ).toBe(true);
    expect(
      isFewestTurns([cand({ teamPlayerId: 'a', turns: 1 }), cand({ teamPlayerId: 'b', turns: 1 })]),
    ).toBe(false);
  });
  it('is false for a pool of one or none', () => {
    expect(isFewestTurns([cand({ teamPlayerId: 'a' })])).toBe(false);
    expect(isFewestTurns([])).toBe(false);
  });
});

describe('jerseyDutyStatus', () => {
  const base = { teamPlayerId: 'tp', acceptedAt: null, doneAt: null, voidedAt: null };
  it('reads UNASSIGNED without a row or a holder', () => {
    expect(jerseyDutyStatus(null)).toBe('UNASSIGNED');
    expect(jerseyDutyStatus({ ...base, teamPlayerId: null })).toBe('UNASSIGNED');
  });
  it('reads ASSIGNED, ACCEPTED, DONE, VOIDED in increasing precedence', () => {
    expect(jerseyDutyStatus(base)).toBe('ASSIGNED');
    expect(jerseyDutyStatus({ ...base, acceptedAt: d('2026-10-01T00:00:00Z') })).toBe('ACCEPTED');
    expect(
      jerseyDutyStatus({
        ...base,
        acceptedAt: d('2026-10-01T00:00:00Z'),
        doneAt: d('2026-10-02T00:00:00Z'),
      }),
    ).toBe('DONE');
    expect(
      jerseyDutyStatus({
        ...base,
        doneAt: d('2026-10-02T00:00:00Z'),
        voidedAt: d('2026-10-03T00:00:00Z'),
      }),
    ).toBe('VOIDED');
  });
});

describe('planSuggestion', () => {
  const next = { id: 'm1', startsAt: d('2026-10-04T18:00:00Z') };
  it('suggests for the next match', () => {
    expect(planSuggestion({ id: 'm1' }, next)).toEqual({ kind: 'NEXT_MATCH' });
  });
  it('defers a later match to the next one', () => {
    expect(planSuggestion({ id: 'm2' }, next)).toEqual({
      kind: 'AFTER_PREVIOUS',
      previousMatchStartsAt: next.startsAt,
    });
  });
  it('treats an event with no known next match as the next one', () => {
    expect(planSuggestion({ id: 'm1' }, null)).toEqual({ kind: 'NEXT_MATCH' });
  });
});
