import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';

export interface ScoresheetVisionExtraction {
  parsedData: ParsedScoresheetData;
  rawResponse: unknown;
}

// Swappable seam: ScoresheetOcrProcessor depends on this interface/token, not
// on GeminiClient directly, so swapping the vision provider (see
// docs/backend-stack.md's still-open "vision provider TBD" decision) is a DI
// binding change in ScoresheetsModule, not a rename across call sites.
export interface ScoresheetVisionClient {
  extractScoresheet(imageBuffer: Buffer, mimeType: string): Promise<ScoresheetVisionExtraction>;
}

export const SCORESHEET_VISION_CLIENT = Symbol('SCORESHEET_VISION_CLIENT');
