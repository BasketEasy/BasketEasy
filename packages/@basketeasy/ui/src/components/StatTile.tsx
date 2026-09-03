import { type ReactNode } from 'react';
import { Card, CardContent } from './Card';
import { Text } from './Text';

/**
 * One counted thing: an icon, what it counts, and the number.
 *
 * It was local to `DashboardPage` until the player-first revamp split that
 * page in two — the manager keeps the four-tile row, and the player's
 * personal season card needs the same tile one step smaller. A local
 * component would have been orphaned by the split and re-derived on the
 * other side.
 *
 * The two sizes are two rungs of the surface ladder, not one look scaled:
 * `md` is a `raised` card sitting on the page, `sm` an `inset` one nested
 * inside an already-raised card, which is where a small tile is always used.
 * That is why the size is an enum and not a padding prop.
 *
 * The icon is a node rather than a component so the caller picks it; it
 * arrives sized (`h-4 w-4`) the way every other icon call site in the repo
 * sizes one, and takes its colour from the muted row it sits in.
 */
export interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  size?: 'sm' | 'md';
}

export function StatTile({ icon, label, value, size = 'md' }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <Text as="span" variant="meta" tone="inherit">
          {label}
        </Text>
      </div>
      <Text as="span" variant="display" size={size === 'sm' ? 'xl' : '3xl'}>
        {value}
      </Text>
    </>
  );

  if (size === 'sm') {
    // `inset` brings its own padding, so there is no CardContent here.
    return (
      <Card variant="inset" className="flex flex-col gap-0.5">
        {body}
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-1">{body}</CardContent>
    </Card>
  );
}
