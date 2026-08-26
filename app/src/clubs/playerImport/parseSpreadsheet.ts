import { read, utils } from 'xlsx';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

export class SpreadsheetParseError extends Error {}

/**
 * Reads an uploaded .xlsx/.xls/.csv file into a header row + raw string
 * rows. Always reads the first sheet — FBI's own export and every prior
 * tool's export is single-sheet.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = read(buffer, { type: 'array' });
  } catch {
    throw new SpreadsheetParseError('Impossible de lire ce fichier.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new SpreadsheetParseError('Le fichier ne contient aucune feuille.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });

  if (matrix.length === 0) {
    throw new SpreadsheetParseError('Le fichier est vide.');
  }

  const [headers, ...rows] = matrix;
  return { headers: headers.map((h) => String(h).trim()), rows };
}
