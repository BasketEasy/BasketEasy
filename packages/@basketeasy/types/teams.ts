export interface Team {
  id: string;
  name: string;
  clubIds: string[];
  createdAt: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  addedAt: string;
}

export interface AddTeamMemberRequest {
  userId: string;
}
