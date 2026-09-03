import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { ActiveClubContext } from './useActiveClub';

// Nested inside AccountProvider (not standalone) because computing "which
// club should be active" needs the account session — see useAdminClubs(),
// which itself needs useAccount(). Composing hooks inside a context provider
// like this is normal in this app rather than pushing that composition onto
// every consumer.
export function ActiveClubProvider({ children }: { children: ReactNode }) {
  const adminClubs = useAdminClubs();
  const [activeClubId, setActiveClubId] = useState<string | null>(null);

  // Default-selection: once the admin-clubs list loads, fall back to the
  // first admin club whenever there's no active club yet, or the previously
  // active one has fallen out of the list (e.g. the user lost admin rights
  // to it). Using the functional setState form keeps this effect's
  // dependency array to just `adminClubs` — no need to also depend on
  // `activeClubId`, and setting the same id back is a no-op re-render since
  // React bails out on an unchanged primitive value.
  //
  // An empty list clears the selection rather than keeping it. This provider
  // sits above the router and is never unmounted by a logout, so an id held
  // through "no admin clubs" survives into the next session in the same tab:
  // a plain player signing in after an admin would inherit that club and be
  // offered links into a club they cannot open (a 403 on click-through).
  useEffect(() => {
    setActiveClubId((current) => {
      if (adminClubs.length === 0) return null;
      if (current && adminClubs.some((club) => club.id === current)) {
        return current;
      }
      return adminClubs[0].id;
    });
  }, [adminClubs]);

  const value = useMemo(() => ({ activeClubId, setActiveClubId }), [activeClubId]);

  return <ActiveClubContext.Provider value={value}>{children}</ActiveClubContext.Provider>;
}
