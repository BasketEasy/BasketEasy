import { describe, expect, it } from 'vitest';
import { countEventRoster, type EventRosterRow } from './useEventRoster';

function row(overrides: Partial<EventRosterRow> = {}): EventRosterRow {
  return {
    teamPlayerId: 'tp-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    isMe: false,
    rsvpStatus: null,
    convoked: false,
    ...overrides,
  };
}

describe('countEventRoster', () => {
  it('counts the whole roster while nobody has been called up', () => {
    const counts = countEventRoster([
      row({ teamPlayerId: 'a', rsvpStatus: 'GOING' }),
      row({ teamPlayerId: 'b', rsvpStatus: 'MAYBE' }),
      row({ teamPlayerId: 'c' }),
    ]);

    expect(counts.isConvocationScoped).toBe(false);
    expect(counts.convoked).toBe(0);
    expect(counts.rosterSize).toBe(3);
    expect(counts.answering).toBe(3);
    expect(counts).toMatchObject({ going: 1, maybe: 1, notGoing: 0, pending: 1 });
  });

  it('narrows the response counts to the convoked group once one exists', () => {
    const counts = countEventRoster([
      row({ teamPlayerId: 'a', convoked: true, rsvpStatus: 'GOING' }),
      row({ teamPlayerId: 'b', convoked: true }),
      // Answered, but not in the group: must not be counted as a response.
      row({ teamPlayerId: 'c', rsvpStatus: 'NOT_GOING' }),
    ]);

    expect(counts.isConvocationScoped).toBe(true);
    expect(counts.rosterSize).toBe(3);
    expect(counts.convoked).toBe(2);
    expect(counts.answering).toBe(2);
    expect(counts).toMatchObject({ going: 1, maybe: 0, notGoing: 0, pending: 1 });
  });

  it('reports zeroes rather than throwing on an empty roster', () => {
    expect(countEventRoster([])).toMatchObject({
      rosterSize: 0,
      convoked: 0,
      answering: 0,
      going: 0,
      pending: 0,
      isConvocationScoped: false,
    });
  });
});
