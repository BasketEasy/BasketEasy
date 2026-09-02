import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import type {
  ScoresheetVisionClient,
  ScoresheetVisionExtraction,
} from './scoresheet-vision-client';

// gemini-2.0-flash and gemini-2.5-flash are both retired for this project
// (404 "no longer available to new users", pointing at gemini-3.6-flash).
// gemini-3.6-flash requires a billing account linked to the Google Cloud
// project even for free-tier-quota usage — without one, requests 429 with
// "prepayment credits are depleted". Set up billing at aistudio.google.com
// rather than swapping the model again; there is no free-tier model left
// that works without it.
const MODEL_NAME = 'gemini-3.6-flash';

// The two halves of the sheet carry different data and the model conflates
// them if left to itself: the left-hand blocks are identity and fouls only
// (no points column exists there), while every basket lives in the
// right-hand running-score column. Spelling the marker's notation out is
// what makes the 1/2/3-point distinction readable — see
// docs/superpowers/specs/2026-09-02-scoresheet-points-parsing-design.md.
const PROMPT = `You are reading a French basketball e-Marque scoresheet (feuille de match). \
The sheet has two halves and you must read both.

LEFT HALF — one block per team ("Équipe A" at the top is the home team, "Équipe B" below it the \
away team). Each block lists that team's players: licence number, name, jersey number ("N°"), and \
a "Fautes" section with up to five cells per player, each played foul marked P (or P1/P2/P3 for a \
technical/unsportsmanlike). Count the marked foul cells for that player's personal fouls. These \
blocks contain NO points — never infer a player's points from anything on this half of the sheet.

RIGHT HALF — "MARQUE COURANTE", the running score, which is the ONLY place points are recorded. \
It is a grid of pre-printed cumulative totals (1, 2, 3 … up to 120), in paired columns: the "A" \
column belongs to the home team and the "B" column to the away team. When a team scores, the \
marker strikes through the pre-printed total that team has just reached and writes the scoring \
player's JERSEY NUMBER next to it. The number written beside the box is the scorer's jersey \
number, NOT a score — the score is the pre-printed number of the box itself.

How many points that basket was worth is given by the notation:
- the jersey number is drawn inside a circle -> 3 points;
- the jersey number is written plainly, with no circle -> 2 points;
- the jersey number is written plainly and the struck box carries a dot/point -> 1 point \
(free throw).

Report every marked box in the running score as one scoring play, in sheet order, top to bottom, \
for the A column and then the B column: the team it belongs to, the jersey number written beside \
it, how many points it was worth (1, 2 or 3, per the notation above), and the pre-printed \
cumulative total the box carries. A team's last struck box should equal its final score — use \
that to check you have not skipped or invented a line.

Also extract the final score for each team and the per-quarter scores (the "RÉSULTATS" block at \
the bottom of the sheet). Report each overtime period ("Prolongations") as an extra entry after \
the four quarters, so that the entries always add up to the final score.

If a value is illegible or absent, use null for that field rather than guessing. Leave a player's \
points as null — it is computed from the scoring plays, not read off the sheet.`;

// 'home' is the sheet's Équipe A, 'away' its Équipe B — shared by the roster
// rows and the running-score plays so the two can be joined on jersey number
// (which is only unique within a team).
const TEAM_SIDE_SCHEMA: Schema = {
  type: SchemaType.STRING,
  format: 'enum',
  enum: ['home', 'away'],
  nullable: true,
};

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
          team: TEAM_SIDE_SCHEMA,
          number: { type: SchemaType.NUMBER, nullable: true },
          name: { type: SchemaType.STRING, nullable: true },
          points: { type: SchemaType.NUMBER, nullable: true },
          fouls: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ['team', 'number', 'name', 'points', 'fouls'],
      },
    },
    scoringPlays: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          team: TEAM_SIDE_SCHEMA,
          jerseyNumber: { type: SchemaType.NUMBER, nullable: true },
          points: { type: SchemaType.NUMBER, nullable: true },
          runningScore: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ['team', 'jerseyNumber', 'points', 'runningScore'],
      },
    },
  },
  required: ['homeScore', 'awayScore', 'quarterScores', 'players', 'scoringPlays'],
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
