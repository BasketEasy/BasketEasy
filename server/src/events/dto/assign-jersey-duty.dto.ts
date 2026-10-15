import { IsUUID, ValidateIf } from 'class-validator';
import type { AssignJerseyDutyRequest } from '@basketeasy/types/jersey-duty';

export class AssignJerseyDutyDto implements AssignJerseyDutyRequest {
  // null clears the duty; anything else must be a roster id. Same shape as
  // SetEventLogisticsDto, and undefined (a missing key) fails the UUID check.
  @ValidateIf((dto: AssignJerseyDutyDto) => dto.teamPlayerId !== null)
  @IsUUID()
  teamPlayerId!: string | null;
}
