import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { EventMeetingDialog } from './EventMeetingDialog';
import { MatchTimelineSteps } from './MatchTimelineSteps';

/**
 * The match day as three hours in a column: the meeting point, the arrival at
 * the gym, the tip-off. A TRAINING has no plan, so no timeline. The venue's
 * directions are in the hero, not here.
 *
 * A manager reads where the meeting point comes from (club, team or this
 * match) and adjusts it from the card's foot; a player reads directions under
 * the meeting point instead.
 */
export function EventMatchTimeline({
  clubId,
  teamId,
  event,
  plan,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  plan: EventMeetingPlan;
  canManage: boolean;
}) {
  const [isAdjusting, setIsAdjusting] = useState(false);
  const meetingPoint = plan.meetingPoint;

  return (
    <Card>
      <div className="flex flex-col gap-3.5 p-4">
        <MatchTimelineSteps
          plan={plan}
          location={event.location}
          locationName={event.locationName}
          startsAt={event.startsAt}
          opponentName={event.opponentName}
          canManage={canManage}
          showVenueItinerary={false}
        />
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setIsAdjusting(true)}
          >
            {meetingPoint ? 'Ajuster le RDV' : 'Ajouter un RDV'}
          </Button>
        )}
        {canManage && (
          <EventMeetingDialog
            clubId={clubId}
            teamId={teamId}
            event={event}
            plan={plan}
            open={isAdjusting}
            onOpenChange={setIsAdjusting}
          />
        )}
      </div>
    </Card>
  );
}
