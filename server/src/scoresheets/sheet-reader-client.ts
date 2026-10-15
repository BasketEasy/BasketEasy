import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { asParsedScoresheetData } from '../common/parsed-scoresheet-data';

// A read takes ~8 s (most of it pdfplumber extracting ~3,000 vector paths);
// past this the service is stuck, and the vision model is the better bet.
const READ_TIMEOUT_MS = 30_000;

/**
 * Client for the deterministic e-Marque reader (sheet-reader/, a Python
 * service on the compose network). Not boot-validated, like GEMINI_API_KEY:
 * without SCORESHEET_READER_URL every read goes to the vision model.
 *
 * Never throws. Every way the reader can say no (a 422 for a PDF that isn't
 * an e-Marque V2 export, a timeout, the service being down) returns null, and
 * the caller falls back to the vision model: a missing deterministic read is
 * a slower, less exact read, never a failed job.
 */
@Injectable()
export class SheetReaderClient {
  private readonly logger = new Logger(SheetReaderClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('SCORESHEET_READER_URL') || undefined;
  }

  async readEmarqueBasketball(pdf: Buffer): Promise<ParsedScoresheetData | null> {
    if (!this.baseUrl) {
      return null;
    }
    try {
      const response = await fetch(`${this.baseUrl}/read/emarque-basketball`, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: new Uint8Array(pdf),
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (response.status === 422) {
        // Routine: a PDF from another tool, or an e-Marque whose glyphs changed.
        const body = (await response.json().catch(() => null)) as {
          detail?: { reason?: string };
        } | null;
        this.logger.log(`sheet reader declined: ${body?.detail?.reason ?? 'no reason'}`);
        return null;
      }
      if (!response.ok) {
        this.logger.warn(`sheet reader answered ${response.status}`);
        return null;
      }
      return asParsedScoresheetData(await response.json());
    } catch (error) {
      this.logger.warn(`sheet reader unreachable: ${(error as Error).message}`);
      return null;
    }
  }
}
