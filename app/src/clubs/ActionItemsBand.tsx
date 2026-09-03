import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import { ActionItemRow } from './ActionItemRow';

/**
 * The manager's « À traiter » band — four bounded, already-computed things
 * that need attention (`docs/ux-audit/player-journey.md` §6.6). Two call
 * sites share it: `ManagerHome` (every managed team, above the stat tiles)
 * and `TeamEventsTab` (this team's own items only, pre-filtered by the
 * caller against `item.teamId`) — rather than each re-deriving the
 * `Card`/`SectionHeading` wrapper around a list of `ActionItemRow`s.
 *
 * Renders nothing at all when there is nothing to do — no empty-state card
 * for zero items. Not a query consumer itself: `items` comes from a parent
 * that already branched `error → loading → empty → data` on the dashboard
 * fetch, so there is no loading/error state to add here.
 *
 * `variant="panel" tone="brand"` — Card's existing surface-ladder + tone
 * axes, no new colour: `panel` for the padding/shadow step, `brand` for the
 * orange-tint background that marks "this needs you," same as the event
 * page's decision band.
 */
export function ActionItemsBand({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Card variant="panel" tone="brand" className="flex flex-col gap-3">
      <SectionHeading as="h2" count={items.length}>
        À traiter
      </SectionHeading>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <ActionItemRow key={`${item.kind}-${item.eventId ?? item.clubId}-${index}`} item={item} />
        ))}
      </div>
    </Card>
  );
}
