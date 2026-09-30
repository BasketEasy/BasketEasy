import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { RouteIcon } from '@basketeasy/ui/icons/route';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
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
      <FactTile
        tone="accent"
        icon={<WarningIcon aria-hidden="true" className="h-5 w-5" />}
        label="Lieu non communiqué"
        detail="Les joueurs ne savent pas encore où aller."
        actions={
          <EventVenueDialog
            clubId={clubId}
            teamId={teamId}
            event={event}
            open={isVenueOpen}
            onOpenChange={setIsVenueOpen}
            trigger={<Button className="w-full">Ajouter le lieu</Button>}
          />
        }
      />
    );
  }

  const hasName = event.locationName !== null;
  return (
    <FactTile
      icon={<MapPinIcon size={19} />}
      label={hasName ? event.locationName : event.location}
      detail={
        hasName
          ? event.location
          : event.type === 'MATCH'
            ? 'Lieu de la rencontre'
            : 'Lieu de la séance'
      }
      actions={
        !isUnknown && (
          <>
            <Button asChild variant="outline" size="sm" className="flex-1">
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
            {canEdit && (
              <EventVenueDialog
                clubId={clubId}
                teamId={teamId}
                event={event}
                open={isVenueOpen}
                onOpenChange={setIsVenueOpen}
                trigger={
                  <Button variant="outline" size="icon-responsive" aria-label="Modifier le lieu">
                    <PencilIcon />
                    <span className="hidden md:inline">Modifier le lieu</span>
                  </Button>
                }
              />
            )}
          </>
        )
      }
    />
  );
}
