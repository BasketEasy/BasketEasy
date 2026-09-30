import { type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from './Card';
import { IconBadge } from './IconBadge';
import { Text } from './Text';

export type FactTileTone = 'neutral' | 'accent';

/**
 * One fact about the page's subject, in the hero or a list: an icon, a label,
 * an optional detail line, and the controls that act on it. The event page's
 * venue block, generalised.
 *
 * `tone="accent"` is a missing fact the reader can fix (« Lieu non
 * communiqué »): one sentence and one filled button. A reader who can't fix
 * it gets the neutral tile, no button. `tone` is the only look prop.
 */
export function FactTile({
  icon,
  label,
  detail,
  tone = 'neutral',
  trailing,
  actions,
}: {
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  tone?: FactTileTone;
  /** A control on the head row, after the text (an edit icon). */
  trailing?: ReactNode;
  /** Controls under the head row; pass `className="flex-1"` on the ones that fill. */
  actions?: ReactNode;
}) {
  const isAccent = tone === 'accent';
  return (
    <Card variant="inset" tone={tone} data-tone={tone} className="flex flex-col gap-2.5">
      <div className={cn('flex gap-2.5', isAccent ? 'items-start' : 'items-center')}>
        <IconBadge tone={isAccent ? 'accent' : 'structure'}>{icon}</IconBadge>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <Text as="span" variant="label" size="sm" className="break-words">
            {label}
          </Text>
          {detail !== undefined && detail !== null && (
            <Text as="span" variant="meta" size="xs" className="break-words">
              {detail}
            </Text>
          )}
        </div>
        {trailing}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </Card>
  );
}
