import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { IconBadge } from '@basketeasy/ui/icon-badge';
import { RouteIcon } from '@basketeasy/ui/icons/route';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
import { Text } from '@basketeasy/ui/text';
import { isUnknownEventLocation, type TeamEvent } from '@basketeasy/types/events';
import { MapPinIcon, PencilIcon } from './eventDetailIcons';
import { eventItineraryHref } from './eventItinerary';
import { EventVenueDialog } from './EventVenueDialog';

/**
 * Where the event is, in the hero, for both types: the gym's name over its
 * address, and « Itinéraire ». A manager edits a match's venue right here,
 * where they read « Lieu non communiqué », rather than at the foot of the
 * page (a training keeps editing through `EventEditModal`).
 */
export function EventHeroLocation({
  clubId,
  teamId,
  event,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  canManage: boolean;
}) {
  const [isVenueOpen, setIsVenueOpen] = useState(false);
  const isUnknown = isUnknownEventLocation(event.location);
  const canEdit = canManage && event.type === 'MATCH';

  if (isUnknown && canEdit) {
    return (
      <Card variant="inset" tone="accent" className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2.5">
          <IconBadge tone="accent">
            <WarningIcon aria-hidden="true" className="h-5 w-5" />
          </IconBadge>
          <div className="flex min-w-0 flex-col gap-px">
            <Text as="span" variant="label" size="sm">
              Lieu non communiqué
            </Text>
            <Text as="span" variant="meta" size="xs">
              Les joueurs ne savent pas encore où aller.
            </Text>
          </div>
        </div>
        <EventVenueDialog
          clubId={clubId}
          teamId={teamId}
          event={event}
          open={isVenueOpen}
          onOpenChange={setIsVenueOpen}
          trigger={<Button className="w-full">Ajouter le lieu</Button>}
        />
      </Card>
    );
  }

  const hasName = event.locationName !== null;
  return (
    <Card variant="inset" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <IconBadge>
          <MapPinIcon size={19} />
        </IconBadge>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <Text as="span" variant="label" size="sm" className="break-words">
            {hasName ? event.locationName : event.location}
          </Text>
          <Text as="span" variant="meta" size="xs" className="break-words">
            {hasName
              ? event.location
              : event.type === 'MATCH'
                ? 'Lieu de la rencontre'
                : 'Lieu de la séance'}
          </Text>
        </div>
        {canEdit && (
          <EventVenueDialog
            clubId={clubId}
            teamId={teamId}
            event={event}
            open={isVenueOpen}
            onOpenChange={setIsVenueOpen}
            trigger={
              <Button
                variant="outline"
                size="sm"
                aria-label="Modifier le lieu"
                className="w-9 shrink-0 gap-1.5 px-0 sm:w-auto sm:px-3"
              >
                <PencilIcon />
                <span className="hidden sm:inline">Modifier le lieu</span>
              </Button>
            }
          />
        )}
      </div>
      {!isUnknown && (
        <Button asChild variant="outline" size="sm" className="self-start">
          <a
            href={eventItineraryHref(event.location)}
            target="_blank"
            rel="noreferrer"
            className="gap-1.5"
          >
            <RouteIcon className="h-4 w-4 shrink-0" />
            Itinéraire
          </a>
        </Button>
      )}
    </Card>
  );
}
