export interface Club {
  id: string;
  name: string;
  /** Opaque FFBB club code, stored unvalidated; null when no FFBB link is set. */
  ffbbClubCode: string | null;
  createdAt: string;
}

export interface CreateClubRequest {
  name: string;
  /** Optional FFBB club code, stored unvalidated — see Club.ffbbClubCode. */
  ffbbClubCode?: string;
}
