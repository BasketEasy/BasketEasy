import { Type } from 'class-transformer';
import { IsDefined, IsInt, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_ARRIVAL_BUFFER_MINUTES } from '@basketeasy/types/meeting-points';
import { MeetingPointDto } from './meeting-point.dto';

export class UpdateTeamMeetingSettingsDto {
  // Null on either field inherits the owner club's value.
  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => MeetingPointDto)
  meetingPoint!: MeetingPointDto | null;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_ARRIVAL_BUFFER_MINUTES)
  arrivalBufferMinutes!: number | null;
}
