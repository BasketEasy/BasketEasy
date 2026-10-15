import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';
import type { SetEventConvocationsRequest } from '@basketeasy/types/events';

// A basketball roster is naturally small (~15-20 players); this caps the
// array defensively, mirroring the MAX_PAGE_SIZE/MAX_RECURRING_OCCURRENCES
// bounding already used elsewhere in this module, rather than trusting the
// client to only ever send roster-sized input.
const MAX_CONVOCATION_LIST_SIZE = 100;

export class SetEventConvocationsDto implements SetEventConvocationsRequest {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_CONVOCATION_LIST_SIZE)
  @IsString({ each: true })
  teamPlayerIds!: string[];
}
