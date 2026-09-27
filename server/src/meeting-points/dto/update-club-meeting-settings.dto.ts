import { Type } from 'class-transformer';
import { IsDefined, IsInt, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_ARRIVAL_BUFFER_MINUTES } from '@basketeasy/types/meeting-points';
import { MeetingPointDto } from './meeting-point.dto';

export class UpdateClubMeetingSettingsDto {
  // Null clears the club default; the key itself is required so a PATCH is
  // always an explicit statement of both settings.
  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => MeetingPointDto)
  meetingPoint!: MeetingPointDto | null;

  @IsInt()
  @Min(0)
  @Max(MAX_ARRIVAL_BUFFER_MINUTES)
  arrivalBufferMinutes!: number;
}
