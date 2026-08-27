import type { PaginationParams, SortOrder } from './pagination';
import type { Gender } from './teams';

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  /** Club member this roster entry is linked to, if any. */
  userId: string | null;
  /** FBI's N° national — permanent, follows the player across clubs/seasons. */
  nationalId: string | null;
  /** FBI's N° licence — this season's number, changes yearly. Display only. */
  licenseNumber: string | null;
  birthDate: string | null;
  gender: Gender | null;
  /** Free-text license type code (C, C1, C2, L, ...). */
  licenseType: string | null;
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

export interface ImportPlayersRow {
  firstName: string;
  lastName: string;
  nationalId?: string;
  licenseNumber?: string;
  birthDate?: string;
  gender?: Gender;
  licenseType?: string;
}

export interface ImportPlayersRequest {
  rows: ImportPlayersRow[];
}

export interface ImportPlayersResult {
  created: number;
  updated: number;
  conflicts: number;
}
