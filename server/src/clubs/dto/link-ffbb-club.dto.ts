import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { LinkFfbbClubRequest } from '@basketeasy/types/ffbb';

export class LinkFfbbClubDto implements LinkFfbbClubRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  ffbbClubCode!: string;
}
