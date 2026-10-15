import { Injectable } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { SheetReaderClient } from './sheet-reader-client';
import type {
  ScoresheetVisionClient,
  ScoresheetVisionExtraction,
} from './scoresheet-vision-client';
import { postProcessScoresheet } from './scoresheet-postprocess';

/**
 * The SCORESHEET_VISION_CLIENT binding: an e-Marque PDF goes to the
 * deterministic reader first, everything else (and every PDF it declines) to
 * the vision model. Rationale and measurements:
 * docs/decisions/scoresheets-and-stats.md (« The deterministic reader »).
 *
 * Which read wins is decided by the same validator the OCR worker applies
 * afterwards:
 * - a reader result that passes it is exact, and is used as is;
 * - one that doesn't is still kept when the vision model fails or does no
 *   better, since its glyphs are read exactly and only the sheet itself can be
 *   inconsistent.
 *
 * `rawResponse` names the reader that produced the data, so a stored
 * extraction says which path it came from.
 */
@Injectable()
export class RoutingVisionClient implements ScoresheetVisionClient {
  constructor(
    private readonly sheetReader: SheetReaderClient,
    private readonly vision: GeminiClient,
  ) {}

  async extractScoresheet(
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<ScoresheetVisionExtraction> {
    const fromReader =
      mimeType === 'application/pdf'
        ? await this.sheetReader.readEmarqueBasketball(imageBuffer)
        : null;
    const readerExtraction = fromReader && {
      parsedData: fromReader,
      rawResponse: { reader: 'sheet-reader/emarque-basketball', parsedData: fromReader },
    };
    if (readerExtraction && postProcessScoresheet(fromReader).consistent) {
      return readerExtraction;
    }

    let fromVision: ScoresheetVisionExtraction;
    try {
      fromVision = await this.vision.extractScoresheet(imageBuffer, mimeType);
    } catch (error) {
      if (readerExtraction) {
        return readerExtraction;
      }
      throw error;
    }
    if (readerExtraction && !postProcessScoresheet(fromVision.parsedData).consistent) {
      return readerExtraction;
    }
    return fromVision;
  }
}
