import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { TabBar, TabBarItem } from '@basketeasy/ui/tab-bar';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { HomeIcon } from '@basketeasy/ui/icons/home';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UserIcon } from '@basketeasy/ui/icons/user';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { useActiveAdminClub } from '../clubs/useActiveAdminClub';
import { useHasManageRights } from '../clubs/useHasManageRights';
import { useMyAgenda } from '../clubs/useMyAgenda';
import { useMyTeamList } from '../clubs/useMyTeamList';

/**
 * One routed item. `TabBarItem` owns the look and needs `active` as a
 * boolean, which a `NavLink`'s own `isActive` can't supply from the outside
 * (its render-prop children are taken by the item's icon and label), so the
 * match is recomputed here with `NavLink`'s own default semantics: the exact
 * path, or anything nested under it — which is what keeps « Mon équipe » lit
 * while the player is reading one of that team's events.
 */
function BottomNavItem({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  const { pathname } = useLocation();
  const isActive = pathname === to || pathname.startsWith(`${to}/`);

  return (
    <TabBarItem asChild icon={icon} label={label} count={count} active={isActive}>
      <NavLink to={to} />
    </TabBarItem>
  );
}

/**
 * The primary navigation on a phone, replacing the burger panel the header
 * used to hold.
 *
 * Why a bar and not a menu, in this product specifically: the screen is read
 * one-handed, held low, in a gym with poor light, and the destination set is
 * structurally fixed at four. A 44px target at thumb height beats a control
 * in the top-right corner, and Parquet's active-nav treatment — which exists
 * already and was simply never on screen while the panel stayed shut — tells
 * the reader where they are without opening anything.
 *
 * Desktop keeps the header's horizontal links and renders no bar; this is
 * one component with a viewport branch, not a mobile twin of the header.
 */
export function AppBottomNav() {
  const isDesktop = useIsDesktopViewport();

  // The viewport branch is its own component so the desktop case mounts no
  // hooks at all: the bar's data (`/me/teams`, `/me/dashboard`, the club
  // list) backs items nobody above the breakpoint will ever see, and this is
  // mounted in ProtectedRoute — i.e. on every protected route. Same split as
  // AppHeader/AppHeaderResolved.
  if (isDesktop) return null;

  return <AppBottomNavResolved />;
}

function AppBottomNavResolved() {
  const { hasManageRights, isResolving } = useHasManageRights();
  const { data: teams } = useMyTeamList();
  const { data: dashboard } = useMyAgenda();
  const { activeClubId } = useActiveAdminClub();

  const myTeams = teams ?? [];
  // Rostered teams only: an event on a team the viewer merely administers is
  // not an answer they owe. Mirrors DashboardPage's own tile derivation,
  // which phase 4 folds into the player home this badge points at.
  const rosteredTeamIds = new Set(
    myTeams.filter((team) => team.rosterRole != null).map((team) => team.teamId),
  );
  const awaitingResponseCount = (dashboard?.upcomingEvents ?? []).filter(
    (event) => rosteredTeamIds.has(event.teamId) && event.myRsvpStatus === null,
  ).length;

  if (isResolving) return null;

  const soleTeam = myTeams.length === 1 ? myTeams[0] : undefined;

  return (
    <TabBar ariaLabel="Navigation principale">
      <BottomNavItem
        to="/dashboard"
        icon={<HomeIcon className="h-5 w-5" />}
        label={hasManageRights ? 'Accueil' : 'Ma semaine'}
        // The manager's pip counts what is waiting to be handled, which is
        // the « À traiter » band — phase 9, and no endpoint answers it yet.
        // Until then only the player's answers-owed count is real.
        count={hasManageRights ? undefined : awaitingResponseCount}
      />

      {hasManageRights || !soleTeam ? (
        <BottomNavItem
          to="/my-teams"
          icon={<UsersIcon className="h-5 w-5" />}
          // Plural unless there is exactly one team — a player with none at
          // all lands on an empty /my-teams, which « Mon équipe » would have
          // promised them a team they don't have.
          label={hasManageRights ? 'Équipes' : myTeams.length === 1 ? 'Mon équipe' : 'Mes équipes'}
        />
      ) : (
        // A player with exactly one team goes straight to it: /my-teams would
        // be a whole destination rendering a one-row list with a "Voir"
        // button — a click-through page standing in for a link.
        <BottomNavItem
          to={`/clubs/${soleTeam.clubId}/teams/${soleTeam.teamId}`}
          icon={<UsersIcon className="h-5 w-5" />}
          label="Mon équipe"
        />
      )}

      {/* `useActiveAdminClub` resolves the id against the caller's own admin
          clubs, so this is « Club » only for someone who can actually open
          that roster — not for anyone the context happens to hold an id for. */}
      {activeClubId ? (
        <BottomNavItem
          to={`/clubs/${activeClubId}/members`}
          icon={<BuildingIcon className="h-5 w-5" />}
          label="Club"
        />
      ) : (
        // « Résultats » is phase 8: the post-match surface has no route, and
        // no existing screen shows a player their results. Pointing the slot
        // at the nearest page would lie on every tap, and inventing a route
        // would 404 — so the slot is held, visibly unavailable, and phase 8
        // swaps this one element for a link.
        //
        // It is also where a team manager with no club-admin rights lands:
        // they have no club roster to reach, so they get the player's third
        // item rather than a « Club » that goes nowhere.
        <TabBarItem
          icon={<TrophyIcon className="h-5 w-5" />}
          label="Résultats"
          disabled
          aria-label="Résultats (bientôt disponible)"
          title="Les résultats de vos matchs arriveront bientôt ici."
        />
      )}

      <BottomNavItem to="/account" icon={<UserIcon className="h-5 w-5" />} label="Profil" />
    </TabBar>
  );
}
