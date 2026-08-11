import type { PaginationParams, SortOrder } from './pagination';

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  /** Club member this roster entry is linked to, if any. */
  userId: string | null;
  createdAt: string;
}

export interface CreatePlayerRequest {
  firstName: string;
  lastName: string;
  userId?: string;
}

export interface UpdatePlayerRequest {
  firstName?: string;
  lastName?: string;
  /** Pass null to unlink, a member's userId to link, or omit to leave unchanged. */
  userId?: string | null;
}

export type PlayerSortBy = 'name' | 'createdAt';

export interface ListPlayersParams extends PaginationParams {
  sortBy?: PlayerSortBy;
  sortOrder?: SortOrder;
}
