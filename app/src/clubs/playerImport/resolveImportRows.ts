import type { ImportPlayersRow, Player } from '@basketeasy/types/players';
import type { Gender } from '@basketeasy/types/teams';
import type { ImportTargetField } from './columnMapping';

const IGNORED_LICENSE_TYPES = new Set(['T', 'AS', 'AS HN', 'AGTSP']);

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FRENCH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// FBI-style French labels for the "Sexe" column — never the English enum
// literal ('MEN'/'WOMEN'), so matching against those directly (as this used
// to) left gender unset on every real import.
const MEN_VALUES = new Set(['M', 'H', 'MASCULIN', 'HOMME', 'MEN']);
const WOMEN_VALUES = new Set(['F', 'FEMININ', 'FEMME', 'WOMEN']);

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeGender(raw: string): Gender | undefined {
  const normalized = stripAccents(raw).toUpperCase().trim();
  if (MEN_VALUES.has(normalized)) return 'MEN';
  if (WOMEN_VALUES.has(normalized)) return 'WOMEN';
  return undefined;
}

// Canonicalizes to a date-only ISO string (YYYY-MM-DD) so this always lines
// up with both the API's stored birthDate (sliced to date-only before
// comparison below) and the server DTO's @IsISO8601() check. Accepts an
// already-ISO value (the shape parseSpreadsheet.ts produces for a native
// Excel date cell) or French dd/mm/yyyy text (a CSV/text-cell column, or the
// FBI export's own date format) — anything else is dropped rather than sent
// on, since one bad row would otherwise 400 the entire import batch.
function normalizeBirthDate(raw: string): string | undefined {
  if (!raw) return undefined;
  if (ISO_DATE_PATTERN.test(raw)) return raw;
  const match = raw.match(FRENCH_DATE_PATTERN);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

type ImportRowAction =
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
  return {
    firstName: cell(raw, mapping, 'firstName'),
    lastName: cell(raw, mapping, 'lastName'),
    nationalId: cell(raw, mapping, 'nationalId') || undefined,
    licenseNumber: cell(raw, mapping, 'licenseNumber') || undefined,
    birthDate: normalizeBirthDate(cell(raw, mapping, 'birthDate')),
    gender: normalizeGender(cell(raw, mapping, 'gender')),
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
      // p.birthDate is the API's full ISO timestamp (Player.birthDate.
      // toISOString() server-side, e.g. "2011-03-12T00:00:00.000Z"), while
      // row.birthDate is the date-only string normalizeBirthDate produces —
      // slice to date-only on both sides before comparing.
      const byNameAndBirthDate = existingPlayers.find(
        (p) =>
          p.clubId === clubId &&
          p.firstName === row.firstName &&
          p.lastName === row.lastName &&
          p.birthDate?.slice(0, 10) === row.birthDate,
      );
      if (byNameAndBirthDate) {
        return { row, action: { type: 'update', existingPlayer: byNameAndBirthDate } };
      }
    }

    return { row, action: { type: 'create' } };
  });
}
