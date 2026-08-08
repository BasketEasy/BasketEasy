export interface ClubMembershipInfo {
  clubId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface User {
  id: string;
  email: string;
  memberships: ClubMembershipInfo[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
}
