import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
} from '@basketeasy/types/meeting-points';

// Name and address travel together — one DTO so a request can't set one
// without the other.
export class MeetingPointDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MEETING_POINT_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MEETING_POINT_ADDRESS_MAX_LENGTH)
  address!: string;
}
