import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EventRsvpStatus, EventTravelMode } from '@prisma/client';
import type { GuestInviteRequest, GuestRsvpRequest } from '@basketeasy/types/guest-links';

export class GuestRsvpDto implements GuestRsvpRequest {
  @IsUUID()
  teamPlayerId!: string;

  @IsEnum(EventRsvpStatus)
  status!: EventRsvpStatus;

  @IsOptional()
  @IsEnum(EventTravelMode)
  travelMode?: EventTravelMode;
}

export class GuestPlayerQueryDto {
  @IsUUID()
  teamPlayerId!: string;
}

export class GuestInviteRequestDto implements GuestInviteRequest {
  @IsUUID()
  teamPlayerId!: string;
}
