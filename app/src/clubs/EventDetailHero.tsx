import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';
import { TimeBlock } from '@basketeasy/ui/time-block';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDayFull } from './eventDateFormat';
import { teamAvatarInitials } from './eventDetailLabels';
import { EventVenueBadge } from './EventVenueBadge';
import { EventHeroLocation } from './EventHeroLocation';

/**
 * The event page's hero, identical for both roles: when, what, against whom.
 *
 * It is the same block on the player's and the manager's screen because the
 * facts are the same — only what comes *underneath* it differs (a decision to
 * take, or a group to pilot). The time is the phase-0 `TimeBlock` rather than
 * the inline copy this page carried, so the event's colour weight (solid
 * blue-green for a MATCH, a bordered step for a TRAINING) is decided in one
 * place for all five surfaces that now show it.
 *
 * The `<h1>` is here rather than above the card: on a 390px screen a separate
 * page title above the hero was one more row between the player and the
 * answer they opened the page to give.
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
  return (
    <Card className="flex flex-col gap-3.5 p-3.5 sm:p-4">
      <div className="flex gap-3.5">
        <TimeBlock
          type={event.type}
          startsAt={event.startsAt}
          timeConfirmed={event.timeConfirmed}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {(isMatch || !event.timeConfirmed) && (
            <div className="flex flex-wrap items-center gap-2">
              {isMatch && event.venue && <EventVenueBadge venue={event.venue} />}
              {!event.timeConfirmed && (
                <Badge variant="outline" tone="neutral">
                  Heure à confirmer
                </Badge>
              )}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar size="sm" className="shrink-0">
              <AvatarFallback>{teamAvatarInitials(teamName)}</AvatarFallback>
            </Avatar>
            <Heading as="h1" size="xl" className="m-0 min-w-0">
              {isMatch ? `${teamName} vs ${event.opponentName}` : `${teamName} — Entraînement`}
            </Heading>
          </div>
          <Text as="span" variant="meta" size="xs">
            {formatEventDayFull(event.startsAt)}
          </Text>
        </div>
      </div>
      <EventHeroLocation clubId={clubId} teamId={teamId} event={event} canManage={canManage} />
    </Card>
  );
}
