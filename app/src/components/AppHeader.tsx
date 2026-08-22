import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@basketeasy/ui/dropdown-menu';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useActiveClub } from '../auth/useActiveClub';
import { useIsDesktopViewport } from '../hooks/useIsDesktopViewport';

/**
 * Nav for every protected page — mounted once in ProtectedRoute so it's
 * guaranteed a logged-in user, rather than re-checking that here.
 */
export function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();
  const navigate = useNavigate();
  const adminClubs = useAdminClubs();
  const { activeClubId: contextActiveClubId, setActiveClubId } = useActiveClub();
  // Falls back to the first admin club so the chip/Effectif link never show a
  // stale "no club" state during the one-render gap between adminClubs
  // loading and ActiveClubProvider's own default-selection effect running —
  // it always resolves to the same club that effect is about to set anyway.
  const activeClubId = contextActiveClubId ?? adminClubs[0]?.id ?? null;
  const activeClub = adminClubs.find((club) => club.id === activeClubId);

  const go = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

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
              <span className="w-4 text-center" aria-hidden="true">
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
      <Button variant="ghost" className="justify-start" onClick={() => go('/dashboard')}>
        Tableau de bord
      </Button>
      <Button variant="ghost" className="justify-start" onClick={() => go('/my-teams')}>
        Mes équipes
      </Button>
      {adminClubs.length > 0 && activeClubId && (
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => go(`/clubs/${activeClubId}/members`)}
        >
          Effectif
        </Button>
      )}
      <Button variant="ghost" className="justify-start" onClick={() => go('/account')}>
        Mon profil
      </Button>
      <Button variant="ghost" className="justify-start" onClick={() => go('/clubs/new')}>
        Créer un club
      </Button>
    </>
  );

  return (
    <header className="relative border-b border-border">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-2xl font-extrabold text-orange-text">BasketEasy</span>
          {isDesktop && switcher}
        </div>

        {isDesktop ? (
          <div className="flex flex-wrap items-center justify-end gap-1">{links}</div>
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
          <div className="absolute right-6 top-full z-10 flex w-64 flex-col gap-1 rounded-md border border-border bg-cream p-2 shadow-lg">
            {switcher && <div className="pb-1">{switcher}</div>}
            {links}
          </div>
        </>
      )}
    </header>
  );
}
