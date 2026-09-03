import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Button, buttonVariants } from '@basketeasy/ui/button';
import { Skeleton } from '@basketeasy/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@basketeasy/ui/dropdown-menu';
import { cn } from '@basketeasy/ui/cn';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useActiveAdminClub } from '../clubs/useActiveAdminClub';
import { useActiveClub } from '../auth/useActiveClub';
import { useAccount } from '../auth/useAccount';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { AccountMenu } from './AccountMenu';
import { Text } from '@basketeasy/ui/text';

interface AppHeaderProps {
  /**
   * True while ProtectedRoute is still waiting on the session request. No
   * session means no club/account data exists yet, so this branch must not
   * read useAdminClubs/useActiveClub/useAccount — it renders the brand plus
   * skeleton nav placeholders and nothing interactive (no switcher, no
   * account controls), since none of those controls would have anything real
   * to act on yet.
   *
   * Kept as a structurally separate early return (not a condition threaded
   * through the JSX below) so a later rewrite of this component's nav can't
   * silently drop this branch.
   */
  isResolving?: boolean;
}

/**
 * Nav for every protected page — mounted once in ProtectedRoute so it's
 * guaranteed a logged-in user, rather than re-checking that here.
 *
 * On a phone the header is no longer the navigation: `AppBottomNav` is, and
 * the burger panel this header used to open is gone. What stays here is what
 * a bottom bar has no room for and no business holding — the brand mark, the
 * club switcher (the admin's context), and the account menu.
 */
export function AppHeader({ isResolving = false }: AppHeaderProps = {}) {
  if (isResolving) {
    return (
      <header className="safe-area-top border-b border-border">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4">
          <Text as="span" variant="display" size="2xl" tone="brand">
            Kluvo
          </Text>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </nav>
      </header>
    );
  }

  return <AppHeaderResolved />;
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          buttonVariants({ variant: 'ghost' }),
          'justify-start no-underline',
          // The active treatment: orange tint plus the court-line underline.
          isActive && 'bg-orange-tint text-orange-text shadow-nav-active',
        )
      }
    >
      {children}
    </NavLink>
  );
}

function AppHeaderResolved() {
  const isDesktop = useIsDesktopViewport();
  const { user } = useAccount();
  const adminClubs = useAdminClubs();
  const { setActiveClubId } = useActiveClub();
  const { activeClub, activeClubId } = useActiveAdminClub();

  // Non-navigating: opens/closes the switcher panel and lets an admin
  // change ActiveClubContext's active club. Navigation to a club's roster is
  // the separate "Effectif" link on desktop and the bottom bar's « Club »
  // item on mobile, not this chip/panel — see
  // docs/ux-audit/scoping-plan.md's item 3 for the resolved click model.
  //
  // Rendered at every width: with the burger panel gone, this is the only
  // place an admin on a phone can change which club they are looking at.
  const switcher = adminClubs.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {activeClub?.name}
          <span aria-hidden="true">▾</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Vos clubs (admin)</DropdownMenuLabel>
        {adminClubs.map((club) => {
          const isActive = club.id === activeClubId;
          return (
            <DropdownMenuItem key={club.id} onSelect={() => setActiveClubId(club.id)}>
              <span className="w-4 shrink-0 text-center" aria-hidden="true">
                {isActive ? '✓' : ''}
              </span>
              {club.name}
              {isActive && <span className="sr-only"> (club actif)</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header className="safe-area-top relative border-b border-border bg-surface">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Aller au contenu
      </a>
      <nav
        // Below the desktop breakpoint the primary navigation is AppBottomNav,
        // which carries that name; this header then holds only the club
        // context and the account, and two landmarks may not share a name.
        aria-label={isDesktop ? 'Navigation principale' : 'Club et compte'}
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={user ? '/dashboard' : '/'}
            className="font-heading text-2xl font-extrabold text-orange-text no-underline"
          >
            Kluvo
          </Link>
          {switcher}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          {isDesktop && (
            <>
              <HeaderLink to="/dashboard">Tableau de bord</HeaderLink>
              <HeaderLink to="/my-teams">Mes équipes</HeaderLink>
              {activeClubId && (
                <HeaderLink to={`/clubs/${activeClubId}/members`}>Effectif</HeaderLink>
              )}
            </>
          )}
          <AccountMenu />
        </div>
      </nav>
    </header>
  );
}
