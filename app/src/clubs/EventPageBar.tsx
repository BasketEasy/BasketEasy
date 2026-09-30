import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ChevronLeftIcon } from '@basketeasy/ui/icons/chevron-left';
import { Text } from '@basketeasy/ui/text';

/**
 * The way back from an event, in the two shapes the page needs. Below `md`
 * it is a full-bleed bar sticky under `MobileTopBar` (`top-14`, same `z-10`)
 * with an icon back button and the team name; from `md` up it is the ghost
 * link that sits inline above the hero. Both render from one component and
 * hide with `md:` so the switch is the app's one mobile/desktop line.
 *
 * `state` is the origin recorded on the way in, handed on to the team page so
 * its origin-aware back link still resolves to where the journey started.
 */
export function EventPageBar({
  to,
  state,
  teamName,
}: {
  to: string;
  state: unknown;
  teamName: string;
}) {
  return (
    <div className="sticky top-14 z-10 flex h-12 items-center gap-1 border-b border-border bg-surface pl-1 pr-4 md:hidden">
      <Button asChild variant="ghost" size="icon">
        <Link to={to} state={state} aria-label={`Retour à ${teamName}`}>
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
      </Button>
      <Text as="span" variant="label" className="truncate">
        {teamName}
      </Text>
    </div>
  );
}

/** The desktop twin of `EventPageBar`: an inline ghost link, hidden below `md`. */
export function EventBackLink({
  to,
  state,
  teamName,
}: {
  to: string;
  state: unknown;
  teamName: string;
}) {
  return (
    <Button asChild variant="ghost" className="hidden self-start md:inline-flex">
      <Link to={to} state={state}>
        <ChevronLeftIcon className="h-4 w-4" />
        {teamName}
      </Link>
    </Button>
  );
}
