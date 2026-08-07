export interface ClubMembershipInfo {
  clubId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface AuthUser {
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
  user: AuthUser;
}
