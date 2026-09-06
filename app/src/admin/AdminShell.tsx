import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { usePlatformSession } from './platformSession';

const NAV_ITEMS = [
  { to: '/admin', label: 'Purges', end: true },
  { to: '/admin/users', label: 'Comptes inactifs', end: false },
];

/**
 * A plain internal-tool shell: no AppHeader, no club switcher, no bottom nav.
 *
 * Deliberately not dressed as the Kluvo product. Conflating this visually
 * with the app invites an admin to browse it like a support dashboard, when
 * every click here is an audited, justified action against someone else's
 * personal data.
 */
export function AdminShell() {
  const { session, endSession } = usePlatformSession();

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Text variant="eyebrow" size="sm" tone="structure">
            Kluvo · back-office
          </Text>
          {session && (
            <Badge variant="soft" tone="structure" size="sm">
              {session.role === 'DATA_OFFICER' ? 'Délégué à la protection' : 'Support'}
            </Badge>
          )}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-semibold',
                    isActive
                      ? 'bg-orange-tint text-orange-text shadow-nav-active'
                      : 'text-muted hover:text-charcoal',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button variant="outline" size="sm" className="ml-auto" onClick={endSession}>
            Quitter
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
