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

/**
 * The one place logout lives, reachable from every protected page via
 * AppHeader — previously logout only existed as a button on DashboardPage,
 * so /account or any team page had no way to sign out.
 */
export function AccountMenu() {
  const { user } = useAccount();
  const { mutate: logout, isPending } = useLogout();
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
        <DropdownMenuItem asChild>
          <Link to="/about">À propos</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={() => logout()}>
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
