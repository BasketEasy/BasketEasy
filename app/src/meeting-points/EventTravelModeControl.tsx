import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { cn } from '@basketeasy/ui/cn';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { formatEventTime } from '../clubs/eventDateFormat';
import { useEventTravelModeSet } from './useEventTravelModeSet';

/** One card's contents: what it is, where, and — big, on the right — when. */
function ChoiceCard({
  title,
  detail,
  time,
  selected,
}: {
  title: string;
  detail: string;
  time: string | null;
  selected: boolean;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text as="span" variant="label" size="sm" className="font-bold">
          {title}
        </Text>
        <Text as="span" variant="meta" size="xs" className="tabular">
          {detail}
        </Text>
      </span>
      {time ? (
        <Text
          as="span"
          variant="display"
          size="2xl"
          tone={selected ? 'structure' : 'secondary'}
          className="tabular"
        >
          {time}
        </Text>
      ) : (
        <Badge variant="soft" tone="accent">
          À confirmer
        </Badge>
      )}
    </>
  );
}

/**
 * « Comment venez-vous ? » — for a player who answered « Présent » to a match
 * with a meeting point. Inline radio cards rather than a dialog: a
 * single-field, low-risk, high-frequency answer, like the RSVP control above
 * it. Not choosing counts as coming with the group, so that card is already
 * selected the moment the player says they're coming.
 *
 * Before « Présent », on a match that has a meeting point, it leaves a line
 * saying the choice is coming; with no meeting point at all it renders
 * nothing, since there is nothing to choose between.
 */
export function EventTravelModeControl({
  clubId,
  teamId,
  event,
  divided = true,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  /** A rule above the question — for the decision band, where it follows the RSVP answer. */
  divided?: boolean;
}) {
  const { mutate: setTravelMode } = useEventTravelModeSet(clubId, teamId);
  // Optimistic: the selection moves on click, and snaps back on failure.
  const [pending, setPending] = useState<EventTravelMode | null>(null);
  const plan = event.meetingPlan;
  if (!plan?.meetingPoint) return null;

  if (event.myTravelMode === null) {
    return (
      <Text variant="meta" size="xs">
        Le choix « avec le groupe / direct » apparaît dès que vous répondez Oui. Horaires dans « S’y
        rendre » ci-dessous.
      </Text>
    );
  }

  const meetingPoint = plan.meetingPoint;
  const meetsAt = plan.meetsAt ? formatEventTime(plan.meetsAt) : null;
  const select = (travelMode: EventTravelMode) => {
    if (travelMode === (pending ?? event.myTravelMode)) return;
    setPending(travelMode);
    setTravelMode(
      { eventId: event.id, travelMode },
      {
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div
      className={cn('flex flex-col gap-2.5', divided && 'mt-1 border-t border-orange/40 pt-3.5')}
    >
      <Text variant="label" size="sm" className="font-bold" id={`travel-mode-${event.id}`}>
        Comment venez-vous&nbsp;?
      </Text>
      <RadioCardGroup<EventTravelMode>
        aria-labelledby={`travel-mode-${event.id}`}
        tone="choice"
        indicator
        className="gap-2"
        value={pending ?? event.myTravelMode}
        onChange={select}
        options={[
          {
            value: 'MEETING_POINT',
            render: ({ selected }) => (
              <ChoiceCard
                title="Avec le groupe, au RDV"
                detail={meetsAt ? `${meetsAt} · ${meetingPoint.name}` : meetingPoint.name}
                time={meetsAt}
                selected={selected}
              />
            ),
          },
          {
            value: 'DIRECT',
            render: ({ selected }) => (
              <ChoiceCard
                title="Directement à la salle"
                detail={event.location}
                time={formatEventTime(plan.arrivalAt)}
                selected={selected}
              />
            ),
          },
        ]}
      />
      <Text variant="meta" size="xs">
        {meetsAt
          ? 'Sans réponse de votre part, vous comptez avec le groupe au RDV.'
          : 'Le coach n’a pas encore confirmé l’heure du RDV. Vous serez prévenu·e dès qu’elle est fixée.'}
      </Text>
    </div>
  );
}
