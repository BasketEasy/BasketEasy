import { describe, expect, it } from 'vitest';
import type { Player } from '@basketeasy/types/players';
import { resolveImportRows } from './resolveImportRows';

const CLUB_ID = 'club-1';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    clubId: CLUB_ID,
    firstName: 'Léa',
    lastName: 'Martin',
    userId: null,
    nationalId: '1234567A',
    licenseNumber: null,
    birthDate: '2011-03-12',
    gender: null,
    licenseType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MAPPING = { firstName: 0, lastName: 1, nationalId: 2, birthDate: 3, licenseType: 4 };

describe('resolveImportRows', () => {
  it('creates when nothing matches', () => {
    const [{ action }] = resolveImportRows(
      [['Théo', 'Dupont', '', '', 'C1']],
      MAPPING,
      [],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'create' });
  });

  it('filters out T/AS/AS HN/AGTSP license-type rows before matching', () => {
    for (const type of ['T', 'AS', 'AS HN', 'AGTSP']) {
      const [{ action }] = resolveImportRows(
        [['Théo', 'Dupont', '', '', type]],
        MAPPING,
        [],
        CLUB_ID,
      );
      expect(action).toEqual({ type: 'ignored', reason: 'license-type' });
    }
  });

  it('skips a row missing firstName or lastName', () => {
    const [{ action }] = resolveImportRows(
      [['', 'Dupont', '', '', 'C1']],
      MAPPING,
      [],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'skip', reason: 'missing-name' });
  });

  it('resolves an update when nationalId matches an existing player at this club', () => {
    const existing = player();
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '1234567A', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('resolves a conflict when nationalId matches an existing player at a different club', () => {
    const existing = player({ clubId: 'other-club' });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '1234567A', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'conflict', existingPlayer: existing });
  });

  it('falls back to club-scoped name+birthDate match when nationalId is unmapped/blank', () => {
    const existing = player({ nationalId: null, birthDate: '2011-03-12' });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '', '2011-03-12', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('does not use the name-only fallback when birthDate is blank on the row', () => {
    const existing = player({ nationalId: null });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'create' });
  });
});
