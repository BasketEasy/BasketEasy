import { IsString } from 'class-validator';
import type { ConfirmEventScoresheetRequest } from '@basketeasy/types/events';

export class ConfirmScoresheetUploadDto implements ConfirmEventScoresheetRequest {
  @IsString()
  r2Key!: string;
}
