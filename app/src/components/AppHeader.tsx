import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { useClubList } from '../clubs/useClubList';

/**
 * Nav for every protected page — mounted once in ProtectedRoute so it's
 * guaranteed a logged-in user, rather than re-checking that here.
 */
export function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { data: clubs } = useClubList();

  const go = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <header className="relative border-b border-border">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <span className="font-heading text-2xl font-extrabold text-orange">BasketEasy</span>

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
      </nav>

      {isOpen && (
        <div className="absolute right-6 top-full z-10 flex w-64 flex-col gap-1 rounded-md border border-border bg-cream p-2 shadow-lg">
          <Button variant="ghost" className="justify-start" onClick={() => go('/dashboard')}>
            Tableau de bord
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => go('/clubs/new')}>
            Créer un club
          </Button>

          {clubs && clubs.length > 0 && (
            <div className="mt-1 flex flex-col gap-1 border-t border-border pt-1">
              {clubs.map((club) => (
                <div key={club.id} className="flex flex-col">
                  <span className="px-3 pt-1 text-xs font-medium uppercase text-muted">
                    {club.name}
                  </span>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => go(`/clubs/${club.id}/roster`)}
                  >
                    Effectif
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
