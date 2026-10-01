import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ChevronLeftIcon } from '@basketeasy/ui/icons/chevron-left';
import { Text } from '@basketeasy/ui/text';

/**
 * The way back from any depth-2 page (an event, a team, a child, a task
 * flow), in the two shapes a page needs. Below `md` it is a full-bleed bar
 * sticky under `MobileTopBar` (`top-14`, same `z-10`) with an icon back
 * button and the parent's name; from `md` up it is `PageBackLink`, the ghost
 * link that sits inline above the hero. Both hide with `md:` so the switch is
 * the app's one mobile/desktop line.
 *
 * It lives in the app rather than `@basketeasy/ui` because it renders
 * `react-router`'s `Link`. `state` is the origin recorded on the way in,
 * handed on so the parent's own origin-aware back link still resolves to
 * where the journey started.
 */
export function PageBar({ to, state, title }: { to: string; state?: unknown; title: string }) {
  return (
    <div className="sticky top-14 z-10 flex h-12 items-center gap-1 border-b border-border bg-surface pl-1 pr-4 md:hidden">
      <Button asChild variant="ghost" size="icon">
        <Link to={to} state={state} aria-label={`Retour à ${title}`}>
          <ChevronLeftIcon size="lg" />
        </Link>
      </Button>
      <Text as="span" variant="label" className="truncate">
        {title}
      </Text>
    </div>
  );
}

/** The desktop twin of `PageBar`: an inline ghost link, hidden below `md`. */
export function PageBackLink({ to, state, title }: { to: string; state?: unknown; title: string }) {
  return (
    <Button asChild variant="ghost" className="hidden self-start md:inline-flex">
      <Link to={to} state={state}>
        <ChevronLeftIcon size="md" />
        {title}
      </Link>
    </Button>
  );
}
