export type ClubRole = 'ADMIN' | 'MEMBER';

export interface ClubMember {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ClubRole;
  joinedAt: string;
}

export interface AddClubMemberRequest {
  email: string;
}
