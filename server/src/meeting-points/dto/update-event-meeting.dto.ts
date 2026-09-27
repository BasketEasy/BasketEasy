import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { MAX_TRAVEL_MINUTES } from '@basketeasy/types/meeting-points';
import { MeetingPointDto } from './meeting-point.dto';

// Every field optional (absent = leave as is) and nullable (null = back to
// inherited/computed). IsOptional lets both undefined and null through; the
// service tells them apart.
export class UpdateEventMeetingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingPointDto)
  meetingPoint?: MeetingPointDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_TRAVEL_MINUTES)
  travelMinutes?: number | null;

  @IsOptional()
  @IsISO8601()
  meetsAt?: string | null;
}
