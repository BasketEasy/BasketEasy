export interface TeamAdmin {
  userId: string;
  email: string;
  teamId: string;
  createdAt: string;
}

export interface AddTeamAdminRequest {
  email: string;
}
