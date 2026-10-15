import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { useAccount } from '../auth/useAccount';

export interface PublicHeaderAnchor {
  /** An in-page anchor, `#semaine`. */
  href: string;
  label: string;
}

interface PublicHeaderProps {
  /** In-page section links, shown from `md` (the landing page's « Fonctionnalités »…). */
  anchors?: readonly PublicHeaderAnchor[];
  /**
   * Show « Créer mon équipe » below `md` too. The landing page turns it off
   * because it pins the same call to action to the bottom of a phone screen.
   */
  ctaOnMobile?: boolean;
}

/**
 * Header for public (unauthenticated-reachable) routes — LandingPage and the
 * legal pages. Distinct from AppHeader, which is mounted by ProtectedRoute
 * and assumes a logged-in user (nav links, club switcher, account menu) —
 * this one has to handle both the logged-out and logged-in cases itself,
 * since a logged-in user can still land on a legal page.
 */
export function PublicHeader({ anchors, ctaOnMobile = true }: PublicHeaderProps = {}) {
  const { user, isLoading } = useAccount();

  return (
    <header className="safe-area-top sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 pl-4 pr-2 md:h-16 md:px-8">
        <Link
          to={user ? '/dashboard' : '/'}
          className={cn('flex shrink-0 items-center gap-2.5 no-underline', focusRing)}
        >
          {/* The logomark, the same file as the favicon; the wordmark names the link. */}
          <img src="/favicon.svg" alt="" width={32} height={32} className="h-7 w-7 md:h-8 md:w-8" />
          <Text as="span" variant="display" size="2xl" tone="brand" className="uppercase">
            Kluvo
          </Text>
        </Link>
        {anchors && anchors.length > 0 && (
          <nav aria-label="Sur cette page" className="hidden items-center gap-1 md:flex">
            {anchors.map((anchor) => (
              <Button key={anchor.href} asChild variant="ghost" size="sm">
                <a href={anchor.href}>{anchor.label}</a>
              </Button>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {!isLoading &&
            (user ? (
              <Button asChild size="sm" className="shrink-0 whitespace-nowrap">
                <Link to="/dashboard">Mon espace</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="shrink-0 whitespace-nowrap">
                  <Link to="/login">Se connecter</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className={cn(
                    'shrink-0 whitespace-nowrap',
                    !ctaOnMobile && 'hidden md:inline-flex',
                  )}
                >
                  <Link to="/register">Créer mon équipe</Link>
                </Button>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
