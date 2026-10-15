import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { LinkFfbbTeamRequest } from '@basketeasy/types/ffbb';

export class AddFfbbLinkDto implements LinkFfbbTeamRequest {
  // Shape/reachability validated live against FFBB in TeamsService, not here
  // — this DTO only guards against an empty/oversized string.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  ffbbTeamUrl!: string;
}
