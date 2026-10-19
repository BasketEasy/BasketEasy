import { z } from 'zod';
import {
  MAX_MATCH_PERIODS,
  type MatchStats,
  type UpdateMatchStatsRequest,
} from '@basketeasy/types/team-stats';

const MAX_STAT = 300;
const MAX_JERSEY_NUMBER = 99;
const REGULATION_PERIODS = 4;

/** One text input's value: a whole number, or empty for « inconnu ». */
const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) <= max), {
      message: `Un nombre entre 0 et ${max}`,
    });
const requiredInt = (max: number) =>
  optionalInt(max).refine((value) => value !== '', { message: 'Requis' });

/** Empty is unknown, never 0. */
function toNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

const lineSchema = z
  .object({
    teamPlayerId: z.string(),
    // Display only (the roster owns the name), kept in the form so a line added
    // from the roster keeps its label without a lookup.
    name: z.string(),
    jerseyNumber: optionalInt(MAX_JERSEY_NUMBER),
    points: optionalInt(MAX_STAT),
    fouls: optionalInt(MAX_STAT),
    freeThrowPoints: optionalInt(MAX_STAT),
    twoPointPoints: optionalInt(MAX_STAT),
    threePointPoints: optionalInt(MAX_STAT),
  })
  .superRefine((line, ctx) => {
    const mismatch = splitMismatch(line);
    if (mismatch) {
      ctx.addIssue({
        code: 'custom',
        path: ['split'],
        message: `3 PTS + 2 PTS + LF = ${mismatch.sum}, mais PTS = ${mismatch.points}.`,
      });
    }
  });

export const matchStatsEditSchema = z
  .object({
    ourScore: requiredInt(MAX_STAT),
    theirScore: requiredInt(MAX_STAT),
    periods: z
      .array(z.object({ ours: optionalInt(MAX_STAT), theirs: optionalInt(MAX_STAT) }))
      .max(MAX_MATCH_PERIODS),
    lines: z.array(lineSchema),
  })
  .superRefine((values, ctx) => {
    const seen = new Map<string, number>();
    values.lines.forEach((line, index) => {
      const number = line.jerseyNumber.trim();
      if (number === '') return;
      if (seen.has(number)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'jerseyNumber'],
          message: 'Numéro déjà utilisé',
        });
      }
      seen.set(number, index);
    });
  });

export type MatchStatsEditValues = z.infer<typeof matchStatsEditSchema>;
export type MatchStatsEditLine = MatchStatsEditValues['lines'][number];

/**
 * The server refuses a split that contradicts the total, but only when all
 * four numbers are known: a manager who knows the points and not how they were
 * made leaves the split empty.
 */
export function splitMismatch(
  line: Pick<
    MatchStatsEditLine,
    'points' | 'freeThrowPoints' | 'twoPointPoints' | 'threePointPoints'
  >,
): { sum: number; points: number } | null {
  const points = toNumber(line.points);
  const parts = [line.freeThrowPoints, line.twoPointPoints, line.threePointPoints].map(toNumber);
  if (points === null || parts.some((part) => part === null)) return null;
  const sum = (parts as number[]).reduce((total, part) => total + part, 0);
  return sum === points ? null : { sum, points };
}

const text = (value: number | null) => (value === null ? '' : String(value));

export function emptyLine(teamPlayerId: string, name: string): MatchStatsEditLine {
  return {
    teamPlayerId,
    name,
    jerseyNumber: '',
    points: '',
    fouls: '',
    freeThrowPoints: '',
    twoPointPoints: '',
    threePointPoints: '',
  };
}

/** The form's starting point: the match as stored, or a blank four-quarter sheet. */
export function toFormValues(stats: MatchStats): MatchStatsEditValues {
  const periods = stats.scoreboard?.periods ?? [];
  return {
    ourScore: text(stats.scoreboard?.ourScore ?? null),
    theirScore: text(stats.scoreboard?.theirScore ?? null),
    periods:
      periods.length > 0
        ? periods.map((period) => ({ ours: text(period.ours), theirs: text(period.theirs) }))
        : Array.from({ length: REGULATION_PERIODS }, () => ({ ours: '', theirs: '' })),
    lines: stats.lines.map((line) => ({
      teamPlayerId: line.teamPlayerId,
      name: `${line.firstName} ${line.lastName.charAt(0).toUpperCase()}.`,
      jerseyNumber: text(line.jerseyNumber),
      points: text(line.points),
      fouls: text(line.fouls),
      freeThrowPoints: text(line.freeThrowPoints),
      twoPointPoints: text(line.twoPointPoints),
      threePointPoints: text(line.threePointPoints),
    })),
  };
}

/**
 * The request for a validated form. A period left fully blank is dropped, so
 * an unused overtime row doesn't become an empty period on the sheet.
 */
export function toRequest(values: MatchStatsEditValues): UpdateMatchStatsRequest {
  return {
    ourScore: Number(values.ourScore),
    theirScore: Number(values.theirScore),
    periods: values.periods
      .filter((period) => period.ours.trim() !== '' || period.theirs.trim() !== '')
      .map((period) => ({ ours: toNumber(period.ours), theirs: toNumber(period.theirs) })),
    lines: values.lines.map((line) => ({
      teamPlayerId: line.teamPlayerId,
      jerseyNumber: toNumber(line.jerseyNumber),
      points: toNumber(line.points),
      fouls: toNumber(line.fouls),
      freeThrowPoints: toNumber(line.freeThrowPoints),
      twoPointPoints: toNumber(line.twoPointPoints),
      threePointPoints: toNumber(line.threePointPoints),
    })),
  };
}

/**
 * How far the players' known points are from our score, for the non-blocking
 * « Écart avec le score » note. Null when nothing is comparable yet (no
 * score typed, or no player points known) or when they agree.
 */
export function scoreGap(
  values: Pick<MatchStatsEditValues, 'ourScore' | 'lines'>,
): { playersTotal: number; ourScore: number } | null {
  if (!/^\d+$/.test(values.ourScore.trim())) return null;
  const known = values.lines
    .map((line) => (/^\d+$/.test(line.points.trim()) ? Number(line.points) : null))
    .filter((points): points is number => points !== null);
  if (known.length === 0) return null;
  const playersTotal = known.reduce((total, points) => total + points, 0);
  const ourScore = Number(values.ourScore);
  return playersTotal === ourScore ? null : { playersTotal, ourScore };
}
