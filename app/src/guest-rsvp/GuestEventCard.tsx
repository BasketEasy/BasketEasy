import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import { TimeBlock } from '@basketeasy/ui/time-block';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import type { GuestEvent, GuestRosterMember } from '@basketeasy/types/guest-links';
import { RsvpAnswerButtons } from '../clubs/RsvpAnswerButtons';
import { formatDayHeading } from '../clubs/eventDateFormat';
import { eventTypeLabel } from '../clubs/eventLabels';
import { MatchTimelineSteps } from '../meeting-points/MatchTimelineSteps';
import { TravelModeChoice } from '../meeting-points/EventTravelModeControl';
import { GuestAttendance } from './GuestAttendance';
import { getGuestErrorMessage } from './guestErrorMessages';
import { useGuestRsvpClear, useGuestRsvpSet } from './useGuestRsvp';
import { eventVenueLabel } from '@basketeasy/types/events';

/**
 * One event on the guest page, from the point of view of the chosen player:
 * their answer and travel choice, whether they are called up, who else is
 * coming, and on a match the day's timeline.
 */
export function GuestEventCard({
  token,
  event,
  roster,
  teamPlayerId,
  via,
  onAnswered,
}: {
  token: string;
  event: GuestEvent;
  roster: GuestRosterMember[];
  teamPlayerId: string;
  /** Set when the visit came through the WhatsApp message, and sent with every write. */
  via?: 'WHATSAPP';
  /** Fired after a successful write, so the page can offer its account nudge once. */
  onAnswered: () => void;
}) {
  const { mutate: setRsvp, isPending: isSetting } = useGuestRsvpSet(token);
  const { mutate: clearRsvp, isPending: isClearing } = useGuestRsvpClear(token);
  const [pendingValue, setPendingValue] = useState<EventRsvpStatus | null>(null);
  const mine = event.attendance.find((a) => a.teamPlayerId === teamPlayerId);
  const status = mine?.status ?? null;
  const plan = event.meetingPlan;
  const isMatch = event.type === 'MATCH';

  const callbacks = {
    onSuccess: onAnswered,
    onError: (err: unknown) =>
      toast({ variant: 'destructive', description: getGuestErrorMessage(err) }),
    onSettled: () => setPendingValue(null),
  };

  const select = (next: EventRsvpStatus) => {
    setPendingValue(next);
    if (status === next) {
      clearRsvp({ eventId: event.id, teamPlayerId, via }, callbacks);
    } else {
      setRsvp({ eventId: event.id, teamPlayerId, status: next, via }, callbacks);
    }
  };

  const selectTravel = (travelMode: EventTravelMode) => {
    if (travelMode === (mine?.travelMode ?? 'MEETING_POINT')) return;
    setRsvp({ eventId: event.id, teamPlayerId, status: 'GOING', travelMode, via }, callbacks);
  };

  return (
    <Card className="flex flex-col gap-3.5 p-3.5 sm:p-4">
      <div className="flex min-w-0 gap-3.5">
        <TimeBlock
          type={event.type}
          startsAt={event.startsAt}
          timeConfirmed={event.timeConfirmed}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={isMatch ? 'brand' : 'structure'}>{eventTypeLabel(event.type)}</Badge>
            {mine?.convoked && <Badge>Convoqué·e</Badge>}
          </span>
          <Text as="span" variant="display" size="lg">
            {isMatch && event.opponentName
              ? `vs ${event.opponentName}`
              : formatDayHeading(event.startsAt)}
          </Text>
          <Text as="span" variant="meta" size="sm">
            {isMatch && `${formatDayHeading(event.startsAt)} · `}
            {eventVenueLabel(event)}
          </Text>
        </div>
      </div>

      {event.notes && (
        <Text variant="meta" size="sm">
          {event.notes}
        </Text>
      )}

      <div className="flex flex-col gap-1.5">
        <RsvpAnswerButtons
          value={status}
          onSelect={select}
          pendingValue={pendingValue}
          disabled={isSetting || isClearing}
          fullWidth
        />
        {status !== null && (
          <Text variant="meta" size="xs">
            Touchez à nouveau votre réponse pour l&apos;annuler.
          </Text>
        )}
      </div>

      {isMatch && plan?.meetingPoint && status === 'GOING' && (
        <TravelModeChoice
          eventId={event.id}
          plan={plan}
          meetingPoint={plan.meetingPoint}
          venueLabel={eventVenueLabel(event)}
          value={mine?.travelMode ?? 'MEETING_POINT'}
          onChange={selectTravel}
        />
      )}

      {isMatch && plan && (
        <MatchTimelineSteps
          plan={plan}
          location={event.location}
          locationName={event.locationName}
          startsAt={event.startsAt}
          opponentName={event.opponentName}
          canManage={false}
        />
      )}

      <GuestAttendance event={event} roster={roster} />
    </Card>
  );
}
