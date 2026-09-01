import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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
import { Text } from '@basketeasy/ui/text';

interface AppHeaderProps {
  /**
   * True while ProtectedRoute is still waiting on the session request. No
   * session means no club/account data exists yet, so this branch must not
   * read useAdminClubs/useActiveClub/useAccount — it renders the brand plus
   * skeleton nav placeholders and nothing interactive (no switcher, no
   * burger, no account controls), since none of those controls would have
   * anything real to act on yet.
   *
   * Kept as a structurally separate early return (not a condition threaded
   * through the JSX below) so a later rewrite of this component's nav
   * (Task 10) can't silently drop this branch.
   */
  isResolving?: boolean;
}

/**
 * Nav for every protected page — mounted once in ProtectedRoute so it's
 * guaranteed a logged-in user, rather than re-checking that here.
 */
export function AppHeader({ isResolving = false }: AppHeaderProps = {}) {
  if (isResolving) {
    return (
      <header className="border-b border-border">
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

function HeaderLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
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
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isDesktop = useIsDesktopViewport();
  const { user } = useAccount();
  const adminClubs = useAdminClubs();
  const { activeClubId: contextActiveClubId, setActiveClubId } = useActiveClub();
  // Falls back to the first admin club so the chip/Effectif link never show a
  // stale "no club" state during the one-render gap between adminClubs
  // loading and ActiveClubProvider's own default-selection effect running —
  // it always resolves to the same club that effect is about to set anyway.
  const activeClubId = contextActiveClubId ?? adminClubs[0]?.id ?? null;
  const activeClub = adminClubs.find((club) => club.id === activeClubId);

  // Closes the mobile panel once a link is followed, mirroring the old
  // go()'s setIsOpen(false) + navigate. Harmless on desktop, where isOpen is
  // never true to begin with.
  const closeMenu = () => setIsOpen(false);

  // Belt-and-suspenders close on any navigation, including AccountMenu's own
  // <Link> items (which have no closeMenu hook of their own) and browser
  // back/forward — without this, navigating from the account menu on mobile
  // leaves the panel and backdrop stuck over the new page.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Escape mirrors the backdrop-click dismissal below, so keyboard users get
  // the same way out of the mobile menu as mouse/touch users.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Non-navigating: opens/closes the switcher panel and lets an admin
  // change ActiveClubContext's active club. Navigation to a club's roster is
  // the separate, persistent "Effectif" link below, not this chip/panel —
  // see docs/ux-audit/scoping-plan.md's item 3 for the resolved click model.
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

  const links = (
    <>
      <HeaderLink to="/dashboard" onClick={closeMenu}>
        Tableau de bord
      </HeaderLink>
      <HeaderLink to="/my-teams" onClick={closeMenu}>
        Mes équipes
      </HeaderLink>
      {adminClubs.length > 0 && activeClubId && (
        <HeaderLink to={`/clubs/${activeClubId}/members`} onClick={closeMenu}>
          Effectif
        </HeaderLink>
      )}
      <HeaderLink to="/clubs/new" onClick={closeMenu}>
        Créer un club
      </HeaderLink>
    </>
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
            className="font-heading text-2xl font-extrabold text-orange-text no-underline"
          >
            Kluvo
          </Link>
          {isDesktop && switcher}
        </div>

        {isDesktop ? (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {links}
            <AccountMenu />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="2" y1="5" x2="18" y2="5" />
              <line x1="2" y1="10" x2="18" y2="10" />
              <line x1="2" y1="15" x2="18" y2="15" />
            </svg>
          </Button>
        )}
      </nav>

      {!isDesktop && isOpen && (
        <>
          {/* Sits between page content and the menu (page < backdrop < menu)
              so the menu no longer collides visually with content underneath
              it, and gives mobile users a click-outside way to dismiss it. */}
          <div
            className="fixed inset-0 z-[5] bg-charcoal/30"
            aria-hidden="true"
            data-testid="mobile-menu-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-6 top-full z-10 flex w-64 flex-col gap-1 rounded-md border border-border bg-surface p-2 shadow-lg">
            {switcher && <div className="pb-1">{switcher}</div>}
            {links}
            <AccountMenu />
          </div>
        </>
      )}
    </header>
  );
}
