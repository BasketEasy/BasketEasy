import type { ImportPlayersRow, Player } from '@basketeasy/types/players';
import type { Gender } from '@basketeasy/types/teams';
import type { ImportTargetField } from './columnMapping';

const IGNORED_LICENSE_TYPES = new Set(['T', 'AS', 'AS HN', 'AGTSP']);

export type ImportRowAction =
  | { type: 'create' }
  | { type: 'update'; existingPlayer: Player }
  | { type: 'conflict'; existingPlayer: Player }
  | { type: 'skip'; reason: 'missing-name' }
  | { type: 'ignored'; reason: 'license-type' };

export interface ResolvedImportRow {
  row: ImportPlayersRow;
  action: ImportRowAction;
}

function cell(
  raw: string[],
  mapping: Partial<Record<ImportTargetField, number>>,
  field: ImportTargetField,
): string {
  const index = mapping[field];
  if (index === undefined) return '';
  return (raw[index] ?? '').trim();
}

function toImportRow(
  raw: string[],
  mapping: Partial<Record<ImportTargetField, number>>,
): ImportPlayersRow {
  const gender = cell(raw, mapping, 'gender').toUpperCase();
  return {
    firstName: cell(raw, mapping, 'firstName'),
    lastName: cell(raw, mapping, 'lastName'),
    nationalId: cell(raw, mapping, 'nationalId') || undefined,
    licenseNumber: cell(raw, mapping, 'licenseNumber') || undefined,
    birthDate: cell(raw, mapping, 'birthDate') || undefined,
    gender: gender === 'MEN' || gender === 'WOMEN' ? (gender as Gender) : undefined,
    licenseType: cell(raw, mapping, 'licenseType') || undefined,
  };
}

export function resolveImportRows(
  rawRows: string[][],
  mapping: Partial<Record<ImportTargetField, number>>,
  existingPlayers: Player[],
  clubId: string,
): ResolvedImportRow[] {
  return rawRows.map((raw) => {
    const row = toImportRow(raw, mapping);

    if (row.licenseType && IGNORED_LICENSE_TYPES.has(row.licenseType)) {
      return { row, action: { type: 'ignored', reason: 'license-type' } };
    }

    if (!row.firstName || !row.lastName) {
      return { row, action: { type: 'skip', reason: 'missing-name' } };
    }

    if (row.nationalId) {
      const byNationalId = existingPlayers.find((p) => p.nationalId === row.nationalId);
      if (byNationalId) {
        return {
          row,
          action:
            byNationalId.clubId === clubId
              ? { type: 'update', existingPlayer: byNationalId }
              : { type: 'conflict', existingPlayer: byNationalId },
        };
      }
    }

    if (row.birthDate) {
      const byNameAndBirthDate = existingPlayers.find(
        (p) =>
          p.clubId === clubId &&
          p.firstName === row.firstName &&
          p.lastName === row.lastName &&
          p.birthDate === row.birthDate,
      );
      if (byNameAndBirthDate) {
        return { row, action: { type: 'update', existingPlayer: byNameAndBirthDate } };
      }
    }

    return { row, action: { type: 'create' } };
  });
}
