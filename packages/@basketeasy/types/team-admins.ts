export interface TeamAdmin {
  userId: string;
  email: string;
  teamId: string;
  createdAt: string;
}

/** A member of one of the team's linked clubs, eligible to be granted TeamAdmin. */
export interface TeamAdminCandidate {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AddTeamAdminRequest {
  userId: string;
}
