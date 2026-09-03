import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@basketeasy/ui/dropdown-menu';
import { useAccount } from '../auth/useAccount';
import { useLogout } from '../auth/mutations';
import { useShowCreateClub } from '../clubs/useShowCreateClub';

/**
 * The one place logout lives, reachable from every protected page via
 * AppHeader — previously logout only existed as a button on DashboardPage,
 * so /account or any team page had no way to sign out. It also holds what
 * the primary navigation gave up: « Créer un club ». Desktop-only: on a
 * phone this header doesn't render at all, and the same items live on
 * `/account` instead (`AccountPage`).
 */
export function AccountMenu() {
  const { user } = useAccount();
  const { mutate: logout, isPending } = useLogout();
  const showCreateClub = useShowCreateClub();
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mon compte">
          <Avatar size="md">
            <AvatarFallback>{initials || '·'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="break-all">{user?.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/account">Mon profil</Link>
        </DropdownMenuItem>
        {showCreateClub && (
          <DropdownMenuItem asChild>
            {/* Out of the primary navigation, where it held a permanent slot
                that never applied to a licensee and applies once in an admin's
                lifetime — see docs/ux-audit/player-journey.md §4.2. Hidden for
                a pure player (rostered somewhere, admin nowhere): they have no
                use for it, see useShowCreateClub. */}
            <Link to="/clubs/new">Créer un club</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={() => logout()}>
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
