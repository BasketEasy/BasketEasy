import { IsIn, IsOptional } from 'class-validator';
import type {
  ClubMemberSortBy,
  ClubRole,
  ListClubMembersParams,
} from '@basketeasy/types/club-members';
import type { SortOrder } from '@basketeasy/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const ROLES: ClubRole[] = ['ADMIN', 'MEMBER'];
const SORT_FIELDS: ClubMemberSortBy[] = ['name', 'email', 'joinedAt'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ListClubMembersDto extends PaginationQueryDto implements ListClubMembersParams {
  @IsOptional()
  @IsIn(ROLES)
  role?: ClubRole;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: ClubMemberSortBy;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
