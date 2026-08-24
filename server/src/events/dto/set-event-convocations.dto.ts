import { ArrayUnique, IsArray, IsString } from 'class-validator';
import type { SetEventConvocationsRequest } from '@basketeasy/types/events';

export class SetEventConvocationsDto implements SetEventConvocationsRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  teamPlayerIds!: string[];
}
