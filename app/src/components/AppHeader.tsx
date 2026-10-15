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
import { useActiveClub } from '../auth/useActiveClub';
import { useAccount } from '../auth/useAccount';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { AccountMenu } from './AccountMenu';
import { NotificationBell, NotificationBellLink } from '../notifications/NotificationBell';
import { PersonaSwitcher } from '../guardians/PersonaSwitcher';
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
 * On a phone it is a compact bar — wordmark and notification bell only.
 * `AppBottomNav` stays the navigation there, and everything else the desktop
 * header holds (the club switcher, "Créer un club", logout) lives on
 * `/account` instead, reachable from the bottom bar's Profil tab.
 */
export function AppHeader({ isResolving = false }: AppHeaderProps = {}) {
  const isDesktop = useIsDesktopViewport();
  if (!isDesktop) return <MobileTopBar isResolving={isResolving} />;

  if (isResolving) {
    return (
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4">
          <Text as="span" variant="display" size="2xl" tone="brand" className="uppercase">
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

function MobileTopBar({ isResolving }: { isResolving: boolean }) {
  const { user } = useAccount();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="flex h-14 items-center justify-between gap-2 pl-4 pr-2">
        <Link
          to={user ? '/dashboard' : '/'}
          className="font-heading text-2xl font-extrabold uppercase text-orange-text no-underline"
        >
          Kluvo
        </Link>
        {!isResolving && (
          <div className="flex items-center gap-1">
            <PersonaSwitcher />
            <NotificationBellLink />
          </div>
        )}
      </div>
    </header>
  );
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
  const { user } = useAccount();
  const adminClubs = useAdminClubs();
  const { activeClubId: contextActiveClubId, setActiveClubId } = useActiveClub();
  // Falls back to the first admin club so the chip/Effectif link never show a
  // stale "no club" state during the one-render gap between adminClubs
  // loading and ActiveClubProvider's own default-selection effect running —
  // it always resolves to the same club that effect is about to set anyway.
  const activeClubId = contextActiveClubId ?? adminClubs[0]?.id ?? null;
  const activeClub = adminClubs.find((club) => club.id === activeClubId);

  // Non-navigating: opens/closes the switcher panel and lets an admin
  // change ActiveClubContext's active club. Navigation to a club's roster is
  // the separate "Effectif" link, not this chip/panel (one non-navigating
  // toggle, one link, settled in design review). On a
  // phone the equivalent switcher lives on `/account` instead (this header
  // doesn't render there at all).
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
    <header className="relative border-b border-border bg-surface">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Aller au contenu
      </a>
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={user ? '/dashboard' : '/'}
            className="font-heading text-2xl font-extrabold uppercase text-orange-text no-underline"
          >
            Kluvo
          </Link>
          {switcher}
          <PersonaSwitcher />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          <HeaderLink to="/dashboard">Tableau de bord</HeaderLink>
          <HeaderLink to="/my-teams">Mes équipes</HeaderLink>
          {activeClubId && <HeaderLink to={`/clubs/${activeClubId}/members`}>Effectif</HeaderLink>}
          {/* A sibling of AccountMenu, not an item inside it: notifications
              are a destination of their own, and an unread count buried
              behind an avatar defeats the point of having one. */}
          <NotificationBell />
          <AccountMenu />
        </div>
      </nav>
    </header>
  );
}
