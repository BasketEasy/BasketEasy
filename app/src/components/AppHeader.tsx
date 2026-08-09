import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { useClubList } from '../clubs/useClubList';
import { useAccount } from '../auth/useAccount';

const DESKTOP_BREAKPOINT_PX = 768;

// A burger menu is a mobile pattern — on a wide screen it just hides
// navigation the user expects to see at a glance, so above the breakpoint
// the same links render inline instead of behind a toggle.
function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX,
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktop;
}

/**
 * Nav for every protected page — mounted once in ProtectedRoute so it's
 * guaranteed a logged-in user, rather than re-checking that here.
 */
export function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();
  const navigate = useNavigate();
  const { user } = useAccount();
  const { data: clubs } = useClubList();

  const adminClubIds = new Set(
    (user?.memberships ?? []).filter((m) => m.role === 'ADMIN').map((m) => m.clubId),
  );
  const adminClubs = (clubs ?? []).filter((club) => adminClubIds.has(club.id));

  const go = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const links = (
    <>
      <Button variant="ghost" className="justify-start" onClick={() => go('/dashboard')}>
        Tableau de bord
      </Button>
      <Button variant="ghost" className="justify-start" onClick={() => go('/account')}>
        Mon profil
      </Button>
      <Button variant="ghost" className="justify-start" onClick={() => go('/clubs/new')}>
        Créer un club
      </Button>

      {adminClubs.length > 0 && (
        <div
          className={
            isDesktop
              ? 'flex items-center gap-2 border-l border-border pl-2'
              : 'mt-1 flex flex-col gap-1 border-t border-border pt-1'
          }
        >
          {adminClubs.map((club) => (
            <div key={club.id} className={isDesktop ? 'flex items-center gap-1' : 'flex flex-col'}>
              <span
                className={
                  isDesktop
                    ? 'text-xs font-medium uppercase text-muted'
                    : 'px-3 pt-1 text-xs font-medium uppercase text-muted'
                }
              >
                {club.name}
              </span>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => go(`/clubs/${club.id}/members`)}
              >
                Effectif
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <header className="relative border-b border-border">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <span className="font-heading text-2xl font-extrabold text-orange">BasketEasy</span>

        {isDesktop ? (
          <div className="flex items-center gap-1">{links}</div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
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
        <div className="absolute right-6 top-full z-10 flex w-64 flex-col gap-1 rounded-md border border-border bg-cream p-2 shadow-lg">
          {links}
        </div>
      )}
    </header>
  );
}
