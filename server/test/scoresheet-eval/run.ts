/* eslint-disable no-console */
/**
 * Scoresheet eval: runs the production vision read over every golden sheet
 * and grades it field by field (src/scoresheets/eval/score-extraction.ts).
 *
 *   pnpm --filter @basketeasy/server eval:scoresheets -- --inputs <dir> [--reader routing|gemini|sheet-reader] [--out report.json] [--mismatches]
 *
 * `--reader` picks what is graded: `routing` (the default) is the production
 * binding, the deterministic reader on PDFs then the vision model; `gemini`
 * and `sheet-reader` grade one path alone. `gemini` and `routing` read
 * GEMINI_API_KEY, `sheet-reader` and `routing` read SCORESHEET_READER_URL
 * (e.g. http://localhost:8000 with sheet-reader/ running under uvicorn).
 *
 * `<dir>` is a private, local folder holding the source files the goldens
 * name in `inputs` (e.g. emarque-01.pdf). They are never committed: they
 * carry names and licence numbers. A golden whose files are absent is
 * skipped, so the same folder can hold PDFs today and phone photos later.
 *
 * Every read goes through postProcessScoresheet, so what is graded is what a
 * club would see after the OCR job, points derivation included. The headline
 * figure is « silent errors »: reads with at least one wrong field that the
 * validator still accepted, i.e. sheets that would land PARSED instead of
 * NEEDS_REVIEW. Lowering that number matters more than any accuracy ratio.
 *
 * Calls are sequential on purpose: the provider's free tier rate-limits, and
 * a 429 midway would make a run incomparable with the previous one.
 */
import type { ScoresheetValidationIssue } from '@basketeasy/types/scoresheet-extraction';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from '../../src/scoresheets/gemini-client';
import { SheetReaderClient } from '../../src/scoresheets/sheet-reader-client';
import { RoutingVisionClient } from '../../src/scoresheets/routing-vision-client';
import type { ScoresheetVisionClient } from '../../src/scoresheets/scoresheet-vision-client';
import { postProcessScoresheet } from '../../src/scoresheets/scoresheet-postprocess';
import { loadGoldenScoresheets } from '../../src/scoresheets/eval/golden';
import {
  SCORE_CATEGORIES,
  scoreExtraction,
  sumScores,
  type ExtractionScore,
  type FieldTally,
} from '../../src/scoresheets/eval/score-extraction';

const GOLDEN_DIR = join(__dirname, 'golden');

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

interface InputResult {
  golden: string;
  input: string;
  error?: string;
  consistent?: boolean;
  issues?: ScoresheetValidationIssue[];
  confidence?: number;
  score?: ExtractionScore;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function percent(tally: FieldTally): string {
  return tally.total === 0
    ? '   —'
    : `${Math.round((tally.correct / tally.total) * 100)}%`.padStart(4);
}

function row(cells: string[]): string {
  return cells.map((c, i) => (i < 2 ? c.padEnd(18) : c.padStart(12))).join(' ');
}

function buildReader(name: string): ScoresheetVisionClient {
  const config = new ConfigService();
  const sheetReader = new SheetReaderClient(config);
  if (name !== 'gemini' && !process.env.SCORESHEET_READER_URL) {
    throw new Error('SCORESHEET_READER_URL is not set.');
  }
  if (name !== 'sheet-reader' && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  switch (name) {
    case 'gemini':
      return new GeminiClient(config);
    case 'routing':
      return new RoutingVisionClient(sheetReader, new GeminiClient(config));
    case 'sheet-reader':
      return {
        async extractScoresheet(buffer) {
          const parsedData = await sheetReader.readEmarqueBasketball(buffer);
          if (!parsedData) {
            throw new Error('declined by the sheet reader');
          }
          return { parsedData, rawResponse: parsedData };
        },
      };
    default:
      throw new Error(`Unknown --reader ${name}.`);
  }
}

async function main(): Promise<void> {
  const inputsDir = argValue('--inputs') ?? process.env.SCORESHEET_EVAL_INPUTS;
  if (!inputsDir) {
    throw new Error('Pass --inputs <dir> (or set SCORESHEET_EVAL_INPUTS).');
  }
  const vision = buildReader(argValue('--reader') ?? 'routing');
  const results: InputResult[] = [];

  for (const golden of loadGoldenScoresheets(GOLDEN_DIR)) {
    for (const input of golden.inputs) {
      const path = join(inputsDir, input);
      const mimeType = MIME_TYPES[extname(input).toLowerCase()];
      if (!existsSync(path) || !mimeType) {
        console.warn(`skip ${input}: ${mimeType ? 'not found' : 'unsupported type'}`);
        continue;
      }
      process.stderr.write(`reading ${input}…\n`);
      try {
        const { parsedData: visionData } = await vision.extractScoresheet(
          readFileSync(path),
          mimeType,
        );
        const { parsedData, confidence, consistent, issues } = postProcessScoresheet(visionData);
        results.push({
          golden: golden.id,
          input,
          consistent,
          issues,
          confidence,
          score: scoreExtraction(golden.expected, parsedData),
        });
      } catch (error) {
        results.push({ golden: golden.id, input, error: (error as Error).message });
      }
    }
  }

  if (results.length === 0) {
    throw new Error(`No golden input found in ${inputsDir}.`);
  }

  console.log(row(['golden', 'input', ...SCORE_CATEGORIES, 'spurious', 'validator']));
  for (const r of results) {
    if (!r.score) {
      console.log(row([r.golden, r.input, `FAILED: ${r.error}`]));
      continue;
    }
    console.log(
      row([
        r.golden,
        r.input,
        ...SCORE_CATEGORIES.map((c) => percent(r.score!.categories[c])),
        `${r.score.spurious.plays}p/${r.score.spurious.players}j`,
        r.consistent ? 'PARSED' : 'NEEDS_REVIEW',
      ]),
    );
    if (process.argv.includes('--mismatches')) {
      for (const issue of r.issues ?? []) {
        console.log(
          `    ${issue.severity} ${issue.code} ${issue.side}` +
            (issue.runningScore === null ? '' : ` @${issue.runningScore}`) +
            (issue.jerseyNumber === null ? '' : ` #${issue.jerseyNumber}`),
        );
      }
      for (const m of r.score.mismatches) {
        console.log(`    ${m.category} ${m.field}: expected ${m.expected}, got ${m.actual}`);
      }
    }
  }

  const graded = results.filter((r) => r.score);
  const total = sumScores(graded.map((r) => r.score!));
  console.log(
    row([
      'TOTAL',
      `${graded.length}/${results.length} read`,
      ...SCORE_CATEGORIES.map((c) => percent(total.categories[c])),
    ]),
  );
  const wrong = graded.filter(
    (r) => r.score!.mismatches.length > 0 || r.score!.spurious.plays || r.score!.spurious.players,
  );
  const silent = wrong.filter((r) => r.consistent);
  console.log(`exact reads: ${graded.length - wrong.length}/${graded.length}`);
  console.log(`silent errors (wrong but PARSED): ${silent.length}/${graded.length}`);

  const out = argValue('--out');
  if (out) {
    writeFileSync(out, `${JSON.stringify({ results, total }, null, 2)}\n`);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
