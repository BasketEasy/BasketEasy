export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface CreatePlayerRequest {
  firstName: string;
  lastName: string;
}

export interface UpdatePlayerRequest {
  firstName?: string;
  lastName?: string;
}
