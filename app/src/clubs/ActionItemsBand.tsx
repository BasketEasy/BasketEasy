import { SectionHeading } from '@basketeasy/ui/section-heading';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import { ActionItemRow } from './ActionItemRow';

/**
 * The manager's « À traiter » band — four bounded, already-computed things
 * that need attention (`docs/personas.md`). Two call
 * sites share it: `ManagerHome` (every managed team)
 * and `TeamEventsTab` (this team's own items only, pre-filtered by the
 * caller against `item.teamId`) — rather than each re-deriving the
 * `SectionHeading` wrapper around a list of `ActionItemRow`s.
 *
 * Renders nothing at all when there is nothing to do — no empty-state card
 * for zero items. Not a query consumer itself: `items` comes from a parent
 * that already branched `error → loading → empty → data` on the dashboard
 * fetch, so there is no loading/error state to add here.
 */
export function ActionItemsBand({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading as="h2" count={items.length}>
        À traiter
      </SectionHeading>
      <div className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <ActionItemRow key={`${item.kind}-${item.eventId ?? item.clubId}-${index}`} item={item} />
        ))}
      </div>
    </section>
  );
}
