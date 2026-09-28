import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { usePlatformSession } from './platformSession';
import { AdminSearchBox } from './AdminSearchBox';
import { adminPaths } from './shared/adminPaths';

const NAV_ITEMS: { to: string; label: string; end?: boolean; dataOfficerOnly?: boolean }[] = [
  { to: adminPaths.dashboard, label: 'Tableau de bord', end: true },
  { to: adminPaths.clubs, label: 'Clubs' },
  { to: adminPaths.teams, label: 'Équipes' },
  { to: adminPaths.users, label: 'Utilisateurs' },
  { to: adminPaths.players, label: 'Joueurs' },
  { to: adminPaths.events, label: 'Événements' },
  { to: adminPaths.scoresheets, label: 'Feuilles de marque' },
  { to: adminPaths.retention, label: 'Rétention' },
  // The audit log route is DATA_OFFICER-only on the server; offering it to
  // SUPPORT would only lead to a 403.
  { to: adminPaths.auditLog, label: 'Journal d’audit', dataOfficerOnly: true },
];

function Wordmark() {
  return (
    <Text as="span" variant="display" size="xl" tone="structure" className="tracking-wide-caps">
      KLUVO
    </Text>
  );
}

function AdminNav() {
  const { session } = usePlatformSession();
  const items = NAV_ITEMS.filter(
    (item) => !item.dataOfficerOnly || session?.role === 'DATA_OFFICER',
  );

  return (
    <nav aria-label="Back-office" className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2.5 text-sm font-bold',
              focusRing,
              isActive ? 'bg-orange-tint text-orange-text' : 'text-charcoal hover:bg-surface-2',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function RoleBadge() {
  const { session } = usePlatformSession();
  if (!session) return null;
  return (
    <Badge variant="soft" tone="structure">
      {session.role === 'DATA_OFFICER' ? 'Délégué à la protection' : 'Support'}
    </Badge>
  );
}

/**
 * A plain internal-tool shell: no AppHeader, no club switcher, no bottom nav.
 *
 * Deliberately not dressed as the Kluvo product. Conflating this visually
 * with the app invites an admin to browse it like a support dashboard, when
 * every click here is an audited, justified action against someone else's
 * personal data.
 *
 * A sidebar on desktop (nine sections don't fit a top bar); on a phone, a top
 * bar whose menu button opens the same nav.
 */
export function AdminShell() {
  const { endSession } = usePlatformSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-ground md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-5 bg-surface px-3.5 py-5 shadow-sm md:flex">
        <div className="flex flex-col gap-2 px-1.5">
          <Wordmark />
          <Text as="span" variant="eyebrow" size="xs" tone="secondary">
            Back-office
          </Text>
          <div>
            <RoleBadge />
          </div>
        </div>
        <AdminNav />
        <div className="mt-auto px-1.5">
          <Button variant="outline" className="w-full" onClick={endSession}>
            Quitter
          </Button>
        </div>
      </aside>

      <header className="bg-surface shadow-sm md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <Wordmark />
            <RoleBadge />
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={isMenuOpen}
            aria-controls="admin-mobile-nav"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            Menu
          </Button>
        </div>
        {isMenuOpen && (
          <div
            id="admin-mobile-nav"
            className="flex flex-col gap-3 border-t border-border px-4 py-3"
          >
            <AdminNav />
            <Button variant="outline" onClick={endSession}>
              Quitter
            </Button>
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
        <div className="flex justify-end">
          <AdminSearchBox />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
