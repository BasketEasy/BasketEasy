import { IsIn, IsOptional } from 'class-validator';
import type { TeamCategory, Gender, TeamSortBy } from '@basketeasy/types/teams';
import type { ListTeamsParams } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const CATEGORIES: TeamCategory[] = ['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS'];
const GENDERS: Gender[] = ['MEN', 'WOMEN'];
const SORT_FIELDS: TeamSortBy[] = ['name', 'category', 'createdAt'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListTeamsDto extends PaginationQueryDto implements ListTeamsParams {
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: TeamCategory;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: TeamSortBy;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
