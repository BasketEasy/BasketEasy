import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { useAccount } from '../auth/useAccount';

/**
 * Header for public (unauthenticated-reachable) routes — today just
 * LandingPage, previously rolling its own copy of this brand/CTA logic
 * (docs/ux-audit/README.md finding 2.7). Distinct from AppHeader, which is
 * mounted by ProtectedRoute and assumes a logged-in user (nav links, club
 * switcher, account menu) — this one has to handle both the logged-out and
 * logged-in cases itself, since a logged-in user can still land on `/`.
 */
export function PublicHeader() {
  const { user, isLoading } = useAccount();

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <Link
          to={user ? '/dashboard' : '/'}
          className="font-heading text-2xl font-extrabold text-orange-text no-underline"
        >
          BasketEasy
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {!isLoading &&
            (user ? (
              <Button asChild className="shrink-0 whitespace-nowrap">
                <Link to="/dashboard">Mon espace</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="shrink-0 whitespace-nowrap">
                  <Link to="/login">Se connecter</Link>
                </Button>
                <Button asChild className="shrink-0 whitespace-nowrap">
                  <Link to="/register">Créer un compte</Link>
                </Button>
              </>
            ))}
        </div>
      </nav>
    </header>
  );
}
