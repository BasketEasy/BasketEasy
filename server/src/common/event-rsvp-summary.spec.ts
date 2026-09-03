import { computeEventRsvpSummaries } from './event-rsvp-summary';

describe('computeEventRsvpSummaries', () => {
  it('returns a zeroed summary for an event with no rsvp/convocation rows', () => {
    const result = computeEventRsvpSummaries(['event-1'], new Map([['event-1', 10]]), [], []);

    expect(result.get('event-1')).toEqual({
      rosterSize: 10,
      convoked: 0,
      answering: 10,
      going: 0,
      maybe: 0,
      notGoing: 0,
      pending: 10,
      isConvocationScoped: false,
    });
  });

  // Unconvoked: answering describes the whole roster (rosterSize), and
  // going/maybe/notGoing/pending come straight from whoever has responded —
  // matches countEventRoster's `answering = rows` branch.
  it('scopes the response counts to the whole roster when nobody is convoked yet', () => {
    const result = computeEventRsvpSummaries(
      ['event-1'],
      new Map([['event-1', 12]]),
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-2', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-3', status: 'MAYBE' },
        { eventId: 'event-1', teamPlayerId: 'tp-4', status: 'NOT_GOING' },
      ],
      [],
    );

    expect(result.get('event-1')).toEqual({
      rosterSize: 12,
      convoked: 0,
      answering: 12,
      going: 2,
      maybe: 1,
      notGoing: 1,
      pending: 8,
      isConvocationScoped: false,
    });
  });

  // Fully convoked: every roster member is called up, and the response
  // counts describe exactly that convoked group — matches countEventRoster's
  // `answering = convoked` branch when convoked.length === rows.length.
  it('scopes the response counts to the convoked group once anyone is convoked', () => {
    const result = computeEventRsvpSummaries(
      ['event-1'],
      new Map([['event-1', 5]]),
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-2', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-3', status: 'MAYBE' },
        { eventId: 'event-1', teamPlayerId: 'tp-4', status: 'NOT_GOING' },
        // A non-convoked player who still RSVP'd (RSVP is independent of
        // convocation) — must not count toward the convoked-scoped totals.
        { eventId: 'event-1', teamPlayerId: 'tp-99', status: 'GOING' },
      ],
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1' },
        { eventId: 'event-1', teamPlayerId: 'tp-2' },
        { eventId: 'event-1', teamPlayerId: 'tp-3' },
        { eventId: 'event-1', teamPlayerId: 'tp-4' },
        { eventId: 'event-1', teamPlayerId: 'tp-5' },
      ],
    );

    expect(result.get('event-1')).toEqual({
      rosterSize: 5,
      convoked: 5,
      answering: 5,
      going: 2,
      maybe: 1,
      notGoing: 1,
      pending: 1,
      isConvocationScoped: true,
    });
  });

  // Partially convoked: only some of the roster is called up. Response
  // counts must describe the convoked subset only, excluding the
  // non-convoked majority even if they've responded.
  it('excludes non-convoked responders once a partial call-up exists', () => {
    const result = computeEventRsvpSummaries(
      ['event-1'],
      new Map([['event-1', 15]]),
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-2', status: 'MAYBE' },
        // Not convoked, but responded — excluded from the scoped counts.
        { eventId: 'event-1', teamPlayerId: 'tp-10', status: 'GOING' },
      ],
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1' },
        { eventId: 'event-1', teamPlayerId: 'tp-2' },
        { eventId: 'event-1', teamPlayerId: 'tp-3' },
      ],
    );

    expect(result.get('event-1')).toEqual({
      rosterSize: 15,
      convoked: 3,
      answering: 3,
      going: 1,
      maybe: 1,
      notGoing: 0,
      pending: 1,
      isConvocationScoped: true,
    });
  });

  it('computes an independent summary per event in the same batch, regardless of batch size', () => {
    const result = computeEventRsvpSummaries(
      ['event-1', 'event-2', 'event-3'],
      new Map([
        ['event-1', 10],
        ['event-2', 8],
        ['event-3', 20],
      ]),
      [
        { eventId: 'event-1', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-2', teamPlayerId: 'tp-1', status: 'NOT_GOING' },
      ],
      [{ eventId: 'event-2', teamPlayerId: 'tp-1' }],
    );

    expect(result.get('event-1')).toEqual(
      expect.objectContaining({ rosterSize: 10, going: 1, isConvocationScoped: false }),
    );
    expect(result.get('event-2')).toEqual(
      expect.objectContaining({
        rosterSize: 8,
        convoked: 1,
        answering: 1,
        notGoing: 1,
        pending: 0,
        isConvocationScoped: true,
      }),
    );
    expect(result.get('event-3')).toEqual({
      rosterSize: 20,
      convoked: 0,
      answering: 20,
      going: 0,
      maybe: 0,
      notGoing: 0,
      pending: 20,
      isConvocationScoped: false,
    });
  });

  it('defaults rosterSize to 0 for an event id not present in the roster-size map', () => {
    const result = computeEventRsvpSummaries(['event-1'], new Map(), [], []);

    expect(result.get('event-1')).toEqual(
      expect.objectContaining({ rosterSize: 0, answering: 0, pending: 0 }),
    );
  });
});
