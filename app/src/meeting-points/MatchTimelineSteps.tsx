import type { ReactNode } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Text, type TextProps } from '@basketeasy/ui/text';
import { Divider } from '@basketeasy/ui/divider';
import type { EventMeetingPlan, MeetingPointSource } from '@basketeasy/types/meeting-points';
import { formatEventTime } from '../clubs/eventDateFormat';
import { eventVenueLabel, isUnknownEventLocation } from '@basketeasy/types/events';
import { eventItineraryHref } from '../clubs/eventItinerary';

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
 * One step of the match day, in three columns: the hour in the time-block
 * face, a dot on a court-line rule that joins it to the next step, and what
 * happens. The dot is `bg-current` under the step's tone, so no colour is
 * named here.
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
      <Text
        as="span"
        variant="display"
        size="2xl"
        tone={time ? tone : 'secondary'}
        className="tabular w-14 shrink-0"
      >
        {time ?? '--:--'}
      </Text>
      <div className="flex w-3 shrink-0 flex-col items-center">
        <Text
          as="span"
          tone={tone}
          aria-hidden="true"
          className="mt-2.5 block h-3 w-3 rounded-full bg-current"
        />
        {!last && (
          <Divider orientation="vertical" tone="structure" weight="rule" className="my-1 flex-1" />
        )}
      </div>
      <div
        className={
          last
            ? 'flex min-w-0 flex-1 flex-col gap-1 pt-1'
            : 'flex min-w-0 flex-1 flex-col gap-1 pb-4 pt-1'
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
 * The match day as three hours in a column: meeting point, arrival at the
 * gym, tip-off. Presentational, so the event page (`EventMatchTimeline`) and
 * the guest page render the same steps from the same plan.
 *
 * A manager reads where the meeting point comes from; anyone else gets
 * directions under each place. The arrival step only mirrors the venue: it is
 * edited in the event page's hero, which also carries its directions there
 * (`showVenueItinerary` false); the guest page has no hero, so keeps them.
 */
export function MatchTimelineSteps({
  plan,
  location,
  locationName,
  startsAt,
  opponentName,
  canManage,
  showVenueItinerary = true,
}: {
  plan: EventMeetingPlan;
  location: string;
  locationName: string | null;
  startsAt: string;
  opponentName: string | null;
  canManage: boolean;
  showVenueItinerary?: boolean;
}) {
  const meetingPoint = plan.meetingPoint;
  const isUnknown = isUnknownEventLocation(location);
  return (
    <ol className="flex flex-col">
      {meetingPoint && (
        <TimelineStep time={plan.meetsAt ? formatEventTime(plan.meetsAt) : null} tone="structure">
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
          Arrivée · {isUnknown ? 'Salle à confirmer' : eventVenueLabel({ location, locationName })}
        </Text>
        <Text variant="meta" size="xs">
          {plan.arrivalBufferMinutes} min avant le coup d’envoi
        </Text>
        {showVenueItinerary && !canManage && !isUnknown && (
          <ItineraryLink address={location} label="Itinéraire vers la salle" />
        )}
      </TimelineStep>
      <TimelineStep time={formatEventTime(startsAt)} tone="brand" last>
        <Text variant="label" size="sm">
          Coup d’envoi
        </Text>
        {opponentName && (
          <Text variant="meta" size="xs">
            vs {opponentName}
          </Text>
        )}
      </TimelineStep>
    </ol>
  );
}
