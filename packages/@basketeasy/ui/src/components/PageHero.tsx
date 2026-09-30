import { type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Card } from './Card';
import { Heading } from './Heading';
import { Text } from './Text';

// Without an aside the card stays one column at every width, so the title
// doesn't sit in half a card beside an empty cell.
const heroVariants = cva('flex flex-col gap-3.5 p-4 md:grid md:items-center md:gap-6 md:p-6', {
  variants: {
    hasAside: { true: 'md:grid-cols-2', false: 'md:grid-cols-1' },
  },
});

/**
 * An entity page's hero (an event, a team, a club, a child): badges, the
 * parent as an eyebrow, the `h1`, a meta line and, on the right from `md`, a
 * fact (`FactTile`). The event page's hero, generalised so no screen
 * re-derives it. Stacked below `md`, two columns from `md`.
 */
export function PageHero({
  badges,
  eyebrow,
  title,
  titleAction,
  meta,
  aside,
}: {
  badges?: ReactNode;
  /** The parent: team → club, event → team. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** A control beside the title (the edit icon). */
  titleAction?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
}) {
  const hasAside = aside !== undefined && aside !== null && aside !== false;
  return (
    <Card className={heroVariants({ hasAside })}>
      <div className="flex min-w-0 flex-col gap-2">
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        {eyebrow !== undefined && eyebrow !== null && <Text variant="eyebrow">{eyebrow}</Text>}
        <div className="flex items-start gap-3">
          <Heading as="h1" size="hero" className="m-0 min-w-0 flex-1">
            {title}
          </Heading>
          {titleAction}
        </div>
        {meta !== undefined && meta !== null && (
          <Text variant="meta" className="tabular">
            {meta}
          </Text>
        )}
      </div>
      {hasAside && <div>{aside}</div>}
    </Card>
  );
}
