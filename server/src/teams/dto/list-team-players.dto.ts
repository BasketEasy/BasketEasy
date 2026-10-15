import { IsIn, IsOptional } from 'class-validator';
import type { ListTeamPlayersParams, TeamPlayerSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_FIELDS: TeamPlayerSortBy[] = ['name', 'createdAt'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListTeamPlayersDto extends PaginationQueryDto implements ListTeamPlayersParams {
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: TeamPlayerSortBy;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
