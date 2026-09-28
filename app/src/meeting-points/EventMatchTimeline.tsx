import { useState, type ReactNode } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Text, type TextProps } from '@basketeasy/ui/text';
import { Divider } from '@basketeasy/ui/divider';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan, MeetingPointSource } from '@basketeasy/types/meeting-points';
import { formatEventTime } from '../clubs/eventDateFormat';
import { eventItineraryHref } from '../clubs/eventItinerary';
import { EventMeetingDialog } from './EventMeetingDialog';

const SOURCE_LABEL: Record<MeetingPointSource, string> = {
  CLUB: 'RDV du club',
  TEAM: 'RDV de l’équipe',
  EVENT: 'RDV du match',
};

/** Why the meeting time is what it is — the travel source, or the coach's own hour. */
function travelDetail(plan: EventMeetingPlan): string {
  if (plan.meetsAtSource === 'OVERRIDE') return 'Horaire fixé par le coach';
  if (plan.travelMinutes === null) return 'Temps de trajet en cours de calcul';
  if (plan.travelMinutesSource === 'MANUAL') return `Trajet saisi : ${plan.travelMinutes} min`;
  return `Trajet estimé ${plan.travelMinutes} min en voiture`;
}

/**
 * One step of the match day: the hour on the left in the time-block face,
 * joined to the next step by a court-line rule, and what happens on the right.
 */
function TimelineStep({
  time,
  tone,
  last = false,
  children,
}: {
  time: string | null;
  tone: NonNullable<TextProps['tone']>;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex w-14 shrink-0 flex-col items-center">
        <Text
          as="span"
          variant="display"
          size="2xl"
          tone={time ? tone : 'secondary'}
          className="tabular"
        >
          {time ?? '--:--'}
        </Text>
        {!last && (
          <Divider orientation="vertical" tone="structure" weight="rule" className="my-1 flex-1" />
        )}
      </div>
      <div
        className={
          last ? 'flex min-w-0 flex-1 flex-col gap-1' : 'flex min-w-0 flex-1 flex-col gap-1 pb-4'
        }
      >
        {children}
      </div>
    </li>
  );
}

function ItineraryLink({ address, label }: { address: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="mt-1 self-start">
      <a href={eventItineraryHref(address)} target="_blank" rel="noreferrer">
        {label}
      </a>
    </Button>
  );
}

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
        <ol className="flex flex-col">
          {meetingPoint && (
            <TimelineStep
              time={plan.meetsAt ? formatEventTime(plan.meetsAt) : null}
              tone="structure"
            >
              <Text variant="label" size="sm">
                RDV · {meetingPoint.name}
              </Text>
              <Text variant="meta" size="xs">
                {meetingPoint.address}
              </Text>
              <div className="flex flex-wrap items-center gap-1.5">
                {canManage && plan.meetingPointSource && (
                  <Badge variant="soft" tone="structure">
                    {SOURCE_LABEL[plan.meetingPointSource]}
                  </Badge>
                )}
                <Text as="span" variant="meta" size="xs">
                  {plan.meetsAt ? travelDetail(plan) : 'Horaire à confirmer'}
                </Text>
              </div>
              {!canManage && (
                <ItineraryLink address={meetingPoint.address} label="Itinéraire vers le RDV" />
              )}
            </TimelineStep>
          )}
          <TimelineStep time={formatEventTime(plan.arrivalAt)} tone="structure">
            <Text variant="label" size="sm">
              Arrivée à la salle
            </Text>
            <Text variant="meta" size="xs">
              {event.location} · {plan.arrivalBufferMinutes} min avant le coup d’envoi
            </Text>
            {!canManage && (
              <ItineraryLink address={event.location} label="Itinéraire vers la salle" />
            )}
          </TimelineStep>
          <TimelineStep time={formatEventTime(event.startsAt)} tone="brand" last>
            <Text variant="label" size="sm">
              Coup d’envoi
            </Text>
            {event.opponentName && (
              <Text variant="meta" size="xs">
                vs {event.opponentName}
              </Text>
            )}
          </TimelineStep>
        </ol>
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
