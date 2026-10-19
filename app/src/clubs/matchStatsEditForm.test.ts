import { describe, expect, it } from 'vitest';
import type { MatchStats } from '@basketeasy/types/team-stats';
import {
  emptyLine,
  matchStatsEditSchema,
  scoreGap,
  splitMismatch,
  toFormValues,
  toRequest,
} from './matchStatsEditForm';

const stats: MatchStats = {
  hasStats: true,
  manuallyEdited: false,
  scoreboard: {
    ourScore: 62,
    theirScore: 55,
    periods: [
      { ours: 16, theirs: 12 },
      { ours: 14, theirs: null },
    ],
  },
  lines: [
    {
      teamPlayerId: 'tp-1',
      firstName: 'Léa',
      lastName: 'moreau',
      jerseyNumber: 4,
      points: 12,
      fouls: null,
      freeThrowPoints: 2,
      twoPointPoints: 10,
      threePointPoints: 0,
      isMe: false,
    },
  ],
};

describe('toFormValues', () => {
  it('turns the stored match into text inputs, an unknown value into an empty one', () => {
    const values = toFormValues(stats);

    expect(values.ourScore).toBe('62');
    expect(values.periods).toEqual([
      { ours: '16', theirs: '12' },
      { ours: '14', theirs: '' },
    ]);
    expect(values.lines[0]).toMatchObject({
      name: 'Léa M.',
      jerseyNumber: '4',
      points: '12',
      fouls: '',
    });
  });

  it('starts a match with no score on a blank four-quarter sheet', () => {
    const values = toFormValues({
      hasStats: false,
      manuallyEdited: false,
      scoreboard: null,
      lines: [],
    });

    expect(values.ourScore).toBe('');
    expect(values.periods).toHaveLength(4);
    expect(values.lines).toEqual([]);
  });
});

describe('toRequest', () => {
  it('sends numbers, null for an empty field, and drops a fully blank period', () => {
    const values = toFormValues(stats);
    values.periods.push({ ours: '', theirs: '' });

    expect(toRequest(values)).toEqual({
      ourScore: 62,
      theirScore: 55,
      periods: [
        { ours: 16, theirs: 12 },
        { ours: 14, theirs: null },
      ],
      lines: [
        {
          teamPlayerId: 'tp-1',
          jerseyNumber: 4,
          points: 12,
          fouls: null,
          freeThrowPoints: 2,
          twoPointPoints: 10,
          threePointPoints: 0,
        },
      ],
    });
  });
});

describe('splitMismatch', () => {
  const split = (points: string, ft: string, two: string, three: string) =>
    splitMismatch({
      points,
      freeThrowPoints: ft,
      twoPointPoints: two,
      threePointPoints: three,
    });

  it('flags a fully known split that does not add up', () => {
    expect(split('12', '3', '10', '0')).toEqual({ sum: 13, points: 12 });
  });

  it('accepts a split that adds up, and any partly known one', () => {
    expect(split('12', '2', '10', '0')).toBeNull();
    expect(split('12', '', '10', '0')).toBeNull();
    expect(split('', '3', '10', '0')).toBeNull();
  });
});

describe('scoreGap', () => {
  const line = (points: string) => ({ ...emptyLine('tp', 'Léa M.'), points });

  it('reports how far the players’ known points are from our score', () => {
    expect(scoreGap({ ourScore: '62', lines: [line('30'), line('28'), line('')] })).toEqual({
      playersTotal: 58,
      ourScore: 62,
    });
  });

  it('is silent when they agree, when there is no score yet, or no known points', () => {
    expect(scoreGap({ ourScore: '58', lines: [line('30'), line('28')] })).toBeNull();
    expect(scoreGap({ ourScore: '', lines: [line('30')] })).toBeNull();
    expect(scoreGap({ ourScore: '62', lines: [line('')] })).toBeNull();
  });
});

describe('matchStatsEditSchema', () => {
  const valid = () => toFormValues(stats);

  it('accepts a stored match', () => {
    expect(matchStatsEditSchema.safeParse(valid()).success).toBe(true);
  });

  it('requires both final scores, as whole numbers', () => {
    const values = { ...valid(), ourScore: '', theirScore: '5x' };

    const result = matchStatsEditSchema.safeParse(values);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['ourScore', 'theirScore']),
    );
  });

  it('puts a contradicting split on the line, as a message naming both sums', () => {
    const values = valid();
    values.lines[0].freeThrowPoints = '3';

    const result = matchStatsEditSchema.safeParse(values);

    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ['lines', 0, 'split'],
        message: '3 PTS + 2 PTS + LF = 13, mais PTS = 12.',
      }),
    );
  });

  it('refuses a jersey number used by two lines, on the second', () => {
    const values = valid();
    values.lines.push({ ...emptyLine('tp-2', 'Sarah D.'), jerseyNumber: '4' });

    const result = matchStatsEditSchema.safeParse(values);

    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ['lines', 1, 'jerseyNumber'],
        message: 'Numéro déjà utilisé',
      }),
    );
  });
});
