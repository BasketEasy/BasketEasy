import { useAccount } from '../auth/useAccount';

export function useIsClubAdmin(clubId: string | undefined): boolean {
  const { user } = useAccount();
  return user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false;
}
