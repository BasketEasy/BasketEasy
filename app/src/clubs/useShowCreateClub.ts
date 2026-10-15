import { useAdminClubs } from './useAdminClubs';
import { useMyTeamList } from './useMyTeamList';

/**
 * Whether "Créer un club" is worth showing at all. A pure player — rostered
 * on at least one team, admin of none — already has everything they need
 * through their roster and has no reason to create a club; showing the
 * option to them is dead-end clutter, not an affordance. Anyone who is
 * already an admin somewhere, or has no team membership at all yet (the
 * prospective first-time admin), still sees it.
 */
export function useShowCreateClub(): boolean {
  const adminClubs = useAdminClubs();
  const { data: myTeams } = useMyTeamList();

  if (adminClubs.length > 0) return true;
  return (myTeams ?? []).length === 0;
}
