import { useAccount } from '../auth/useAccount';
import { useIsClubAdmin } from './useIsClubAdmin';
import { useTeamAdminList } from './useTeamAdminList';

export function useIsTeamManager(clubId: string, teamId: string): boolean {
  const { user } = useAccount();
  const isClubAdmin = useIsClubAdmin(clubId);
  // `GET .../admins` answers a member of the club (ADMIN or MEMBER) and
  // refuses everyone else, a guardian-only parent included: they hold no
  // membership, so there is nothing to ask and the call could only 403. A
  // club ADMIN is a manager already and needs no list to prove it.
  const isClubMember = user?.memberships.some((m) => m.clubId === clubId) ?? false;
  const { data: teamAdmins } = useTeamAdminList(clubId, teamId, !isClubAdmin && isClubMember);

  if (isClubAdmin) {
    return true;
  }
  return teamAdmins?.some((admin) => admin.userId === user?.id) ?? false;
}
