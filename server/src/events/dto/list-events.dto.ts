import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import type { ListEventsParams } from '@basketeasy/types/events';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListEventsDto extends PaginationQueryDto implements ListEventsParams {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
