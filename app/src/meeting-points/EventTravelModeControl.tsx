import { useState } from 'react';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { formatEventTime } from '../clubs/eventDateFormat';
import { meetingChoiceDetail } from './meetingPlanLabels';
import { useEventTravelModeSet } from './useEventTravelModeSet';

function ChoiceCard({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex flex-col gap-0.5 text-left">
      <Text as="span" variant="label" size="sm" className="font-bold">
        {title}
      </Text>
      <Text as="span" variant="meta" size="xs" className="tabular">
        {detail}
      </Text>
    </span>
  );
}

/**
 * « Comment venez-vous ? » — for a player who answered « Présent » to a match
 * with a meeting point. Inline radio cards rather than a dialog: a
 * single-field, low-risk, high-frequency answer, like the RSVP control above
 * it. Not choosing counts as coming to the meeting point, so that card is
 * already selected the moment the player says they're coming.
 *
 * Renders nothing when there is nothing to choose between: not GOING, a
 * training, or no meeting point configured anywhere.
 */
export function EventTravelModeControl({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  const { mutate: setTravelMode } = useEventTravelModeSet(clubId, teamId);
  // Optimistic: the selection moves on click, and snaps back on failure.
  const [pending, setPending] = useState<EventTravelMode | null>(null);
  const plan = event.meetingPlan;
  if (!plan?.meetingPoint || event.myTravelMode === null) return null;

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
    <div className="flex flex-col gap-1.5">
      <Text variant="label" size="sm" id={`travel-mode-${event.id}`}>
        Comment venez-vous&nbsp;?
      </Text>
      <RadioCardGroup<EventTravelMode>
        aria-labelledby={`travel-mode-${event.id}`}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        value={pending ?? event.myTravelMode}
        onChange={select}
        options={[
          {
            value: 'MEETING_POINT',
            render: () => <ChoiceCard title="Au rendez-vous" detail={meetingChoiceDetail(plan)} />,
          },
          {
            value: 'DIRECT',
            render: () => (
              <ChoiceCard
                title="Direct à la salle"
                detail={`Arrivée ${formatEventTime(plan.arrivalAt)}`}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
