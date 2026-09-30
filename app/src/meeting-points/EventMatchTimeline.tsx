import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { EventMeetingDialog } from './EventMeetingDialog';
import { MatchTimelineSteps } from './MatchTimelineSteps';

/**
 * « Déroulé du match » — the match day as three hours in a column: the
 * meeting point, the arrival at the gym, the tip-off. It replaces the plain
 * venue row on a MATCH (the arrival step carries the gym and its
 * directions); a TRAINING keeps the venue row, having no plan at all.
 *
 * A manager reads where the meeting point comes from (club, team or this
 * match) and adjusts it from the header; a player reads directions under
 * each place instead.
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
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="label" className="flex-1">
              Déroulé du match
            </Text>
            <Button variant="outline" size="sm" onClick={() => setIsAdjusting(true)}>
              {meetingPoint ? 'Ajuster le RDV' : 'Ajouter un RDV'}
            </Button>
          </div>
        )}
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
