import { IsIn, IsOptional } from 'class-validator';
import type { ListPlayersParams, PlayerSortBy } from '@basketeasy/types/players';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_FIELDS: PlayerSortBy[] = ['name', 'createdAt'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListPlayersDto extends PaginationQueryDto implements ListPlayersParams {
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: PlayerSortBy;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
