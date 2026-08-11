import { IsIn, IsOptional } from 'class-validator';
import type { ListTeamClubsParams, TeamClubSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_FIELDS: TeamClubSortBy[] = ['name', 'linkedAt'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListTeamClubsDto extends PaginationQueryDto implements ListTeamClubsParams {
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: TeamClubSortBy;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
