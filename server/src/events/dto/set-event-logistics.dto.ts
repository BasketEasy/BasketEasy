import { IsIn, IsString, ValidateIf } from 'class-validator';
import type { EventLogisticsField, SetEventLogisticsRequest } from '@basketeasy/types/events';

export class SetEventLogisticsDto implements SetEventLogisticsRequest {
  @IsIn(['JERSEYS', 'BALLS'])
  field!: EventLogisticsField;

  // null clears the assignment — only validated as a string when not null,
  // so the "clear" case doesn't need a separate route/payload shape.
  @ValidateIf((dto: SetEventLogisticsDto) => dto.teamPlayerId !== null)
  @IsString()
  teamPlayerId!: string | null;
}
