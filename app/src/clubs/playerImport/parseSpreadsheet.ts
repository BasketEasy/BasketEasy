import { read, utils } from 'xlsx';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

export class SpreadsheetParseError extends Error {}

function cellToString(value: unknown): string {
  if (value instanceof Date) {
    // ISO date only (no time-of-day) — matches the server DTO's IsISO8601
    // check and the plain-string equality the preview/server matching uses.
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

/**
 * Reads an uploaded .xlsx/.xls/.csv file into a header row + raw string
 * rows. Always reads the first sheet — FBI's own export and every prior
 * tool's export is single-sheet.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  let workbook;
  try {
    if (file.name.toLowerCase().endsWith('.csv')) {
      // CSV carries no encoding metadata, and SheetJS's byte-level parser
      // doesn't sniff it — fed raw bytes, it silently mojibakes UTF-8
      // accented characters (é, è...) instead of erroring, which corrupts
      // French names and breaks column-mapping guesses that depend on
      // accented header labels. Decoding as UTF-8 text first (the standard
      // encoding for a modern export, and what TextDecoder assumes) and
      // parsing that string sidesteps the byte-level guessing entirely.
      //
      // raw: true additionally keeps every cell as the literal source text
      // instead of letting SheetJS auto-detect date-/number-looking
      // strings and coerce them (a birthDate column would silently
      // reformat to an ambiguous M/D/YY, a national ID with a leading
      // zero would lose it).
      const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
      workbook = read(text, { type: 'string', raw: true });
    } else {
      // A real .xlsx/.xls date column is a natively typed date cell, not
      // text, so raw:true alone leaves it as an Excel serial number.
      // cellDates:true turns those into JS Date objects instead, which
      // cellToString below reformats to a clean ISO date; every other
      // cell (including a numeric-looking ID) stays exactly as authored.
      workbook = read(await file.arrayBuffer(), { type: 'array', cellDates: true, raw: true });
    }
  } catch {
    throw new SpreadsheetParseError('Impossible de lire ce fichier.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new SpreadsheetParseError('Le fichier ne contient aucune feuille.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });

  if (matrix.length === 0) {
    throw new SpreadsheetParseError('Le fichier est vide.');
  }

  const [headers, ...rows] = matrix;
  return {
    headers: headers.map(cellToString),
    rows: rows.map((row) => row.map(cellToString)),
  };
}
