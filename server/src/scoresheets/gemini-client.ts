import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import type {
  ScoresheetVisionClient,
  ScoresheetVisionExtraction,
} from './scoresheet-vision-client';

// gemini-2.0-flash was retired by Google; 3.6-flash is the current
// equivalent free-tier vision model with the same structured-output support.
const MODEL_NAME = 'gemini-3.6-flash';

const PROMPT = `You are reading a French basketball e-Marque scoresheet (feuille de match). \
Extract the final score for each team, the per-quarter score, and each listed player's jersey \
number, name (if legible), points scored, and personal fouls. If a value is illegible or absent, \
use null for that field rather than guessing.`;

// Gemini's structured-output mode (responseMimeType + responseSchema) keeps
// the SDK from ever having to free-text-parse the model's reply — the SDK
// guarantees the response body matches this shape.
const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    homeScore: { type: SchemaType.NUMBER, nullable: true },
    awayScore: { type: SchemaType.NUMBER, nullable: true },
    quarterScores: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          home: { type: SchemaType.NUMBER, nullable: true },
          away: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ['home', 'away'],
      },
    },
    players: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          number: { type: SchemaType.NUMBER, nullable: true },
          name: { type: SchemaType.STRING, nullable: true },
          points: { type: SchemaType.NUMBER, nullable: true },
          fouls: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ['number', 'name', 'points', 'fouls'],
      },
    },
  },
  required: ['homeScore', 'awayScore', 'quarterScores', 'players'],
};

// Thin wrapper around @google/generative-ai — chosen over Claude/GPT-4V
// vision for this pipeline because it has a genuinely usable free tier (see
// docs/backend-stack.md's open "vision provider TBD" decision). Not
// boot-validated (GEMINI_API_KEY), same "fails only on actual use" pattern
// as StorageService's R2 vars — an unset key only breaks the OCR job, not
// the whole app.
//
// COMPLIANCE FLAG — not yet signed off: this sends the raw scoresheet photo
// (player names, jersey numbers) as inline base64 to Google's Gemini API.
// CLAUDE.md treats France/EU RGPD-compliant hosting as P0 and the R2 bucket
// is deliberately EU-jurisdiction for that reason, but Gemini's processing
// region/retention and whether a DPA is in place are undocumented here.
// Get explicit compliance/legal sign-off on this before shipping real player
// data through it — swapping providers (or self-hosting a model) is a DI
// binding change via SCORESHEET_VISION_CLIENT, not a rewrite, if the answer
// is "not this one".
@Injectable()
export class GeminiClient implements ScoresheetVisionClient {
  private readonly client: GoogleGenerativeAI;

  constructor(config: ConfigService) {
    this.client = new GoogleGenerativeAI(config.get<string>('GEMINI_API_KEY')!);
  }

  async extractScoresheet(
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<ScoresheetVisionExtraction> {
    const model = this.client.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
    ]);
    const parsed = JSON.parse(result.response.text()) as ParsedScoresheetData;
    return { parsedData: parsed, rawResponse: parsed };
  }
}
