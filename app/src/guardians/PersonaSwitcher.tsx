import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { CountBadge } from '@basketeasy/ui/count-badge';
import { useAccount } from '../auth/useAccount';
import { getInitials } from '../clubs/getInitials';
import { useActingAs } from './useActingAs';
import { othersPendingCount, personaCount } from './personaLabels';

/**
 * The header chip showing who the app acts for, like the club switcher next
 * to it. Hidden when there is only one persona. Its pip counts the answers
 * owed by the *other* personas — the one on screen already shows its own.
 */
export function PersonaSwitcher() {
  const { user } = useAccount();
  const { personas, persona, forPlayerId, setSwitcherOpen } = useActingAs();
  if (personaCount(personas) < 2) return null;

  const pending = othersPendingCount(personas, forPlayerId);
  const name = persona ? persona.firstName : 'Moi';
  const initials = persona
    ? getInitials(persona.firstName, persona.lastName)
    : getInitials(user?.firstName ?? 'M', user?.lastName ?? 'oi');
  const label =
    pending > 0
      ? `Changer de profil, actuellement ${name} (${pending} réponses en attente ailleurs)`
      : `Changer de profil, actuellement ${name}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 pl-1.5"
      aria-label={label}
      onClick={() => setSwitcherOpen(true)}
    >
      <Avatar size="sm">
        <AvatarFallback tone={persona ? 'brand' : 'structure'}>{initials}</AvatarFallback>
      </Avatar>
      <span aria-hidden="true">{name}</span>
      <CountBadge count={pending} size="md" />
      <span aria-hidden="true">▾</span>
    </Button>
  );
}
