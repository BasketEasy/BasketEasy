import type { PaginationParams, SortOrder } from './pagination';

export type ClubRole = 'ADMIN' | 'MEMBER';

export interface ClubMember {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ClubRole;
  joinedAt: string;
}

export interface AddClubMemberRequest {
  email: string;
}

export type ClubMemberSortBy = 'name' | 'email' | 'joinedAt';

export interface ListClubMembersParams extends PaginationParams {
  role?: ClubRole;
  sortBy?: ClubMemberSortBy;
  sortOrder?: SortOrder;
}
