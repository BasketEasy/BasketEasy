export interface ClubMembershipInfo {
  clubId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  /**
   * Whether the address has been confirmed through a verification link.
   * Exposed as a boolean rather than the underlying `emailVerifiedAt` date:
   * nothing in the UI shows *when* it happened, only whether the banner and
   * the EmailVerifiedGuard's three gated actions still apply.
   */
  emailVerified: boolean;
  /** Opt-out for notification e-mails. In-app notifications are unaffected. */
  emailNotificationsEnabled: boolean;
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

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  emailNotificationsEnabled?: boolean;
}
