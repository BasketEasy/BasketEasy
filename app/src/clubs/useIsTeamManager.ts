import { useAccount } from '../auth/useAccount';
import { useIsClubAdmin } from './useIsClubAdmin';
import { useTeamAdminList } from './useTeamAdminList';

export function useIsTeamManager(clubId: string, teamId: string): boolean {
  const { user } = useAccount();
  const isClubAdmin = useIsClubAdmin(clubId);
  const { data: teamAdmins } = useTeamAdminList(clubId, teamId);

  if (isClubAdmin) {
    return true;
  }
  return teamAdmins?.some((admin) => admin.userId === user?.id) ?? false;
}
