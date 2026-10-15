import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';

/**
 * One sheet with a known-correct read, as committed under
 * test/scoresheet-eval/golden. The source files themselves are never
 * committed (they carry names and licence numbers): `inputs` names the files
 * the harness looks for in a local, private folder, and several renditions of
 * one match (the e-Marque PDF, a phone photo of its printout) share one
 * `expected`, which is how a photo gets graded against a PDF-derived truth.
 */
export interface GoldenScoresheet {
  id: string;
  inputs: string[];
  /** How `expected` was obtained and checked, for whoever doubts a result. */
  provenance: string;
  expected: ParsedScoresheetData;
}

export function loadGoldenScoresheets(dir: string): GoldenScoresheet[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as GoldenScoresheet);
}
