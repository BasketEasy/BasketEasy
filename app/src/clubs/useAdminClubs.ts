import { useMemo } from 'react';
import type { Club } from '@basketeasy/types/clubs';
import { useAccount } from '../auth/useAccount';
import { useClubList } from './useClubList';

/**
 * Clubs the current user administers (`ClubMembership.role === 'ADMIN'`),
 * cross-referenced against the full club list. Extracted out of `AppHeader`
 * so both it (club switcher) and, later, the Dashboard's stat tiles can
 * derive "which clubs am I admin of" from one place instead of re-deriving
 * it independently — see `docs/ux-audit/scoping-plan.md`'s item 3.
 *
 * No explicit loading signal: today's `AppHeader` did nothing special while
 * `useClubList()`/`useAccount()` were loading (an empty array just renders
 * nothing), so this hook matches that rather than adding one unasked-for.
 *
 * Memoized so consumers get a referentially stable array when the underlying
 * membership/club data hasn't actually changed — `ActiveClubContext`'s
 * default-selection effect depends on this return value by reference, and
 * without memoizing, a background refetch (e.g. `refetchOnWindowFocus`) with
 * unchanged data would re-run that effect on every such refetch.
 */
export function useAdminClubs(): Club[] {
  const { user } = useAccount();
  const { data: clubs } = useClubList();
  const memberships = user?.memberships;

  return useMemo(() => {
    const adminClubIds = new Set(
      (memberships ?? []).filter((m) => m.role === 'ADMIN').map((m) => m.clubId),
    );
    return (clubs ?? []).filter((club) => adminClubIds.has(club.id));
  }, [clubs, memberships]);
}
