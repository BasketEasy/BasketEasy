import type { Club } from '@basketeasy/types/clubs';
import { useActiveClub } from '../auth/useActiveClub';
import { useAdminClubs } from './useAdminClubs';

export interface ActiveAdminClub {
  /**
   * The club an admin is currently looking at, or `null` for anyone who
   * administers no club at all. Never a club the caller lacks admin rights
   * on: `ActiveClubContext` holds a plain id and lives above the router, so
   * the id alone can outlive the membership that justified it (a logout
   * leaves the provider mounted). Resolving it against `useAdminClubs()`
   * here is what stops a plain player inheriting the previous session's club
   * and being offered a link that 403s.
   */
  activeClub: Club | null;
  /** `activeClub.id`, for building a club-scoped route. */
  activeClubId: string | null;
}

/**
 * The one definition of "which club is this admin working in". Both the
 * header's switcher/« Effectif » link and the bottom bar's « Club » item
 * branch on it; two copies of the fallback below drifted apart once already.
 */
export function useActiveAdminClub(): ActiveAdminClub {
  const adminClubs = useAdminClubs();
  const { activeClubId: contextActiveClubId } = useActiveClub();

  // The first admin club covers the one-render gap before
  // ActiveClubProvider's default-selection effect runs, and resolves to the
  // club that effect is about to pick anyway.
  const activeClub =
    adminClubs.find((club) => club.id === contextActiveClubId) ?? adminClubs[0] ?? null;

  return { activeClub, activeClubId: activeClub?.id ?? null };
}
