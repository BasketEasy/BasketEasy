import type { PaginationParams, SortOrder } from './pagination';

export const TEAM_CATEGORIES = ['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS'] as const;
export type TeamCategory = (typeof TEAM_CATEGORIES)[number];

export const GENDERS = ['MEN', 'WOMEN'] as const;
export type Gender = (typeof GENDERS)[number];

export type TeamMemberRole = 'COACH' | 'PLAYER';

export interface Team {
  id: string;
  name: string;
  category: TeamCategory;
  gender: Gender;
  createdAt: string;
}

export interface CreateTeamRequest {
  name: string;
  category: TeamCategory;
  gender: Gender;
  /** Optional full competitions.ffbb.com/.../equipes/<id> URL — creates the team's first FfbbLink, validated on submit. */
  ffbbTeamUrl?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  category?: TeamCategory;
  gender?: Gender;
}

export interface TeamClubLink {
  clubId: string;
  clubName: string;
  /** The club that created the team. Only the owning club can add/remove partner clubs or delete the team. */
  isOwner: boolean;
  linkedAt: string;
}

export interface AddTeamClubRequest {
  clubId: string;
}

export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  clubId: string;
  role: TeamMemberRole;
  createdAt: string;
}

export interface AddTeamPlayerRequest {
  playerId: string;
  role?: TeamMemberRole;
}

export interface UpdateTeamPlayerRequest {
  role: TeamMemberRole;
}

export type TeamSortBy = 'name' | 'category' | 'createdAt';

export interface ListTeamsParams extends PaginationParams {
  category?: TeamCategory;
  gender?: Gender;
  sortBy?: TeamSortBy;
  sortOrder?: SortOrder;
}

export type TeamClubSortBy = 'name' | 'linkedAt';

export interface ListTeamClubsParams extends PaginationParams {
  sortBy?: TeamClubSortBy;
  sortOrder?: SortOrder;
}

export type TeamPlayerSortBy = 'name' | 'createdAt';

export interface ListTeamPlayersParams extends PaginationParams {
  sortBy?: TeamPlayerSortBy;
  sortOrder?: SortOrder;
}
