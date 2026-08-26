import { Module } from '@nestjs/common';
import { FfbbImportService } from './ffbb-import.service';
import { FfbbPageScrapeProvider } from './ffbb-page-scrape.provider';
import { FFBB_PROVIDER } from './ffbb-provider';

@Module({
  providers: [{ provide: FFBB_PROVIDER, useClass: FfbbPageScrapeProvider }, FfbbImportService],
  exports: [FFBB_PROVIDER, FfbbImportService],
})
export class FfbbModule {}
