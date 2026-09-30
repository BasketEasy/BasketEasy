import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EventRsvpStatus, EventRsvpVia, EventTravelMode } from '@prisma/client';
import type { GuestInviteRequest, GuestRsvpRequest } from '@basketeasy/types/guest-links';

export class GuestRsvpDto implements GuestRsvpRequest {
  @IsUUID()
  teamPlayerId!: string;

  @IsEnum(EventRsvpStatus)
  status!: EventRsvpStatus;

  @IsOptional()
  @IsEnum(EventTravelMode)
  travelMode?: EventTravelMode;

  @IsOptional()
  @IsEnum(EventRsvpVia)
  via?: EventRsvpVia;
}

export class GuestPlayerQueryDto {
  @IsUUID()
  teamPlayerId!: string;

  @IsOptional()
  @IsEnum(EventRsvpVia)
  via?: EventRsvpVia;
}

export class GuestInviteRequestDto implements GuestInviteRequest {
  @IsUUID()
  teamPlayerId!: string;
}
