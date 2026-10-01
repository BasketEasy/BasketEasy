import { useAdminClubs } from './useAdminClubs';
import { useClubList } from './useClubList';
import { useMyTeamList } from './useMyTeamList';
import { useActingAs } from '../guardians/useActingAs';

export interface ManageRights {
  /**
   * True for anyone who administers at least one club or holds a `TeamAdmin`
   * grant on at least one team — the split the player-first revamp branches
   * every role-aware screen on (`docs/personas.md`).
   *
   * False while `isResolving` is still true: neither underlying query has
   * answered yet, so "no manage rights" is the *absence* of evidence, not
   * evidence of absence. A consumer that merely picks between two sets of
   * numbers (the dashboard's stat tiles) can read it straight — it renders
   * zeros either way. A consumer whose whole *layout* depends on the role
   * must wait on `isResolving` instead.
   */
  hasManageRights: boolean;
  /**
   * True until both signals have loaded. Exposed because the bottom tab bar
   * would otherwise mount with the player's four items and re-label two of
   * them a beat later, under a thumb that is already moving: a bar that
   * appears late is recoverable, a bar whose tab changed destination between
   * the look and the tap is not. `AppHeader` already holds its nav back the
   * same way while the session resolves.
   */
  isResolving: boolean;
}

/**
 * The one definition of "does this account manage anything". It lived inline
 * in `DashboardPage`; phases 2, 4 and 5 of the revamp all branch on it, and
 * three copies of a role test drift.
 */
export function useHasManageRights(): ManageRights {
  const adminClubs = useAdminClubs();
  // The app-wide screens (dashboard, bottom nav) show the child's player view
  // while acting for a child: a guardian link never carries manager rights,
  // whatever the user holds as themself. A team or event page decides per
  // team instead (`useTeamActingAs`), so a parent who coaches a different
  // team still manages it there while switched to their child.
  const { forPlayerId } = useActingAs();
  const { data: teams, isPending: isTeamListPending } = useMyTeamList();
  // useAdminClubs() deliberately has no loading signal of its own (it returns
  // a plain array), so the club query behind it is consulted here for one
  // rather than widening that hook's contract for a single caller.
  const { isPending: isClubListPending } = useClubList();

  return {
    hasManageRights:
      !forPlayerId && ((teams ?? []).some((team) => team.isTeamAdmin) || adminClubs.length > 0),
    isResolving: isTeamListPending || isClubListPending,
  };
}
