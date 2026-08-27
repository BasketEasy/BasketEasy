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
    // The API returns Player.birthDate.toISOString() — a full timestamp,
    // never a date-only string. Matching that shape here is the point:
    // resolveImportRows must slice to date-only before comparing.
    birthDate: '2011-03-12T00:00:00.000Z',
    gender: null,
    licenseType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MAPPING = {
  firstName: 0,
  lastName: 1,
  nationalId: 2,
  birthDate: 3,
  licenseType: 4,
  gender: 5,
};

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
    const [{ action }] = resolveImportRows([['', 'Dupont', '', '', 'C1']], MAPPING, [], CLUB_ID);
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

  it("falls back to club-scoped name+birthDate match when nationalId is unmapped/blank, against the API's full-timestamp birthDate", () => {
    const existing = player({ nationalId: null });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '', '2011-03-12', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('normalizes a French dd/mm/yyyy birthDate before matching', () => {
    const existing = player({ nationalId: null });
    const [{ action, row }] = resolveImportRows(
      [['Léa', 'Martin', '', '12/03/2011', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(row.birthDate).toBe('2011-03-12');
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('drops an unparseable birthDate instead of passing it through', () => {
    const [{ row }] = resolveImportRows(
      [['Théo', 'Dupont', '', 'not-a-date', 'C1']],
      MAPPING,
      [],
      CLUB_ID,
    );
    expect(row.birthDate).toBeUndefined();
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

  it('maps French Sexe values to the Gender enum', () => {
    const cases: [string, 'MEN' | 'WOMEN' | undefined][] = [
      ['M', 'MEN'],
      ['Masculin', 'MEN'],
      ['H', 'MEN'],
      ['F', 'WOMEN'],
      ['Féminin', 'WOMEN'],
      ['', undefined],
      ['?', undefined],
    ];

    for (const [cell, expected] of cases) {
      const [{ row }] = resolveImportRows(
        [['Théo', 'Dupont', '', '', 'C1', cell]],
        MAPPING,
        [],
        CLUB_ID,
      );
      expect(row.gender).toBe(expected);
    }
  });
});
