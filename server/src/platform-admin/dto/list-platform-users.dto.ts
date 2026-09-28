import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type {
  ListPlatformUsersParams,
  PlatformUserListStatus,
} from '@basketeasy/types/platform-admin';

// One value today, and it stays an enum rather than becoming a boolean: the
// list exists to answer "which accounts is the retention policy about to
// act on", and any second policy would add a status here rather than a
// second route.
const STATUSES: PlatformUserListStatus[] = ['inactive-soon'];

export class ListPlatformUsersDto implements ListPlatformUsersParams {
  @IsOptional()
  @IsIn(STATUSES)
  status?: PlatformUserListStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
