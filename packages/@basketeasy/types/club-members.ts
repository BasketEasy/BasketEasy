export type ClubRole = 'ADMIN' | 'MEMBER';

export interface ClubMember {
  userId: string;
  email: string;
  role: ClubRole;
  joinedAt: string;
}

export interface AddClubMemberRequest {
  email: string;
}
