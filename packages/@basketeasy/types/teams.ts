export type TeamCategory = 'U9' | 'U11' | 'U13' | 'U15' | 'U18' | 'U21' | 'SENIORS';

export type TeamGender = 'MEN' | 'WOMEN';

export interface Team {
  id: string;
  name: string;
  category: TeamCategory;
  gender: TeamGender;
  createdAt: string;
}

export interface CreateTeamRequest {
  name: string;
  category: TeamCategory;
  gender: TeamGender;
}

export interface UpdateTeamRequest {
  name?: string;
  category?: TeamCategory;
  gender?: TeamGender;
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
  createdAt: string;
}

export interface AddTeamPlayerRequest {
  playerId: string;
}
