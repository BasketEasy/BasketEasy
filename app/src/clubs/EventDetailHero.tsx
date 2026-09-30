import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDayFull, formatEventTime } from './eventDateFormat';
import { EventVenueBadge } from './EventVenueBadge';
import { EventHeroLocation } from './EventHeroLocation';

/**
 * The event page's hero, identical for both roles: when, what, against whom,
 * where. It is the same block on the player's and the manager's screen because
 * the facts are the same; only what comes *underneath* it differs (a decision
 * to take, or a group to pilot).
 *
 * The `<h1>` is here rather than above the card: on a 390px screen a separate
 * page title above the hero was one more row between the player and the
 * answer they opened the page to give. The team name is the eyebrow above it,
 * so the title can read « vs {opponent} ». The time block and team avatar stay
 * on the list cards; here the hour is part of the date line.
 *
 * The venue closes the hero for both types (`EventHeroLocation`), which is
 * also where a manager fills in or corrects a match's venue.
 */
export function EventDetailHero({
  clubId,
  teamId,
  event,
  teamName,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  teamName: string;
  canManage: boolean;
}) {
  const isMatch = event.type === 'MATCH';
  const hasBadges = (isMatch && event.venue) || event.isImported || !event.timeConfirmed;
  return (
    <Card className="flex flex-col gap-3.5 p-4 md:grid md:grid-cols-2 md:items-center md:gap-6 md:p-6">
      <div className="flex min-w-0 flex-col gap-2">
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-2">
            {isMatch && event.venue && <EventVenueBadge venue={event.venue} />}
            {event.isImported && (
              <Badge variant="outline" tone="neutral">
                Importé
              </Badge>
            )}
            {!event.timeConfirmed && (
              <Badge variant="outline" tone="neutral">
                Heure à confirmer
              </Badge>
            )}
          </div>
        )}
        <Text variant="eyebrow">{teamName}</Text>
        <Heading as="h1" size="hero" className="m-0">
          {isMatch ? `vs ${event.opponentName}` : 'Entraînement'}
        </Heading>
        <Text variant="meta" className="tabular">
          {formatEventDayFull(event.startsAt)} ·{' '}
          {event.timeConfirmed ? formatEventTime(event.startsAt) : 'heure à confirmer'}
        </Text>
      </div>
      <div>
        <EventHeroLocation clubId={clubId} teamId={teamId} event={event} canManage={canManage} />
      </div>
    </Card>
  );
}
