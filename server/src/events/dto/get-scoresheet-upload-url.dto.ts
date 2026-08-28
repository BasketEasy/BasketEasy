import { IsString } from 'class-validator';
import type { EventScoresheetUploadUrlRequest } from '@basketeasy/types/events';

export class GetScoresheetUploadUrlDto implements EventScoresheetUploadUrlRequest {
  // Allowlist enforced in EventsService (needs to also pick the r2Key file
  // extension from it), not here — keeps that logic in one place.
  @IsString()
  contentType!: string;
}
