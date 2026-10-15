import { deriveMatchResult } from './match-result';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';

function parsedData(overrides: Partial<ParsedScoresheetData> = {}): ParsedScoresheetData {
  return {
    homeScore: 62,
    awayScore: 58,
    quarterScores: [],
    players: [],
    scoringPlays: [],
    ...overrides,
  };
}

describe('deriveMatchResult', () => {
  it('returns a WIN for the home team when homeScore beats awayScore', () => {
    expect(deriveMatchResult('HOME', parsedData({ homeScore: 62, awayScore: 58 }))).toEqual({
      ourScore: 62,
      theirScore: 58,
      outcome: 'WIN',
    });
  });

  it('returns a LOSS for the home team when awayScore beats homeScore', () => {
    expect(deriveMatchResult('HOME', parsedData({ homeScore: 50, awayScore: 55 }))).toEqual({
      ourScore: 50,
      theirScore: 55,
      outcome: 'LOSS',
    });
  });

  it('returns a DRAW when both scores are equal', () => {
    expect(deriveMatchResult('HOME', parsedData({ homeScore: 60, awayScore: 60 }))).toEqual({
      ourScore: 60,
      theirScore: 60,
      outcome: 'DRAW',
    });
  });

  it('mirrors ourScore/theirScore for an AWAY venue — a WIN', () => {
    expect(deriveMatchResult('AWAY', parsedData({ homeScore: 58, awayScore: 62 }))).toEqual({
      ourScore: 62,
      theirScore: 58,
      outcome: 'WIN',
    });
  });

  it('mirrors ourScore/theirScore for an AWAY venue — a LOSS', () => {
    expect(deriveMatchResult('AWAY', parsedData({ homeScore: 55, awayScore: 50 }))).toEqual({
      ourScore: 50,
      theirScore: 55,
      outcome: 'LOSS',
    });
  });

  it('returns a DRAW for an AWAY venue when both scores are equal', () => {
    expect(deriveMatchResult('AWAY', parsedData({ homeScore: 60, awayScore: 60 }))).toEqual({
      ourScore: 60,
      theirScore: 60,
      outcome: 'DRAW',
    });
  });

  it('returns null for a null venue (TRAINING, or a MATCH predating the venue-required rule)', () => {
    expect(deriveMatchResult(null, parsedData())).toBeNull();
  });

  it('returns null for null parsedData (no scoresheet, or an unreadable one)', () => {
    expect(deriveMatchResult('HOME', null)).toBeNull();
  });

  it('returns null when homeScore is still null on a confirmed sheet', () => {
    expect(deriveMatchResult('HOME', parsedData({ homeScore: null }))).toBeNull();
  });

  it('returns null when awayScore is still null on a confirmed sheet', () => {
    expect(deriveMatchResult('AWAY', parsedData({ awayScore: null }))).toBeNull();
  });
});
