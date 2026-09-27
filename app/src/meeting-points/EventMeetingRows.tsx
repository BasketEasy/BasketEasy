import { useState, type ReactNode } from 'react';
import { Button } from '@basketeasy/ui/button';
import { RouteIcon } from '@basketeasy/ui/icons/route';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventTime } from '../clubs/eventDateFormat';
import { ClockIcon, MapPinIcon } from '../clubs/eventDetailIcons';
import { eventItineraryHref } from '../clubs/eventItinerary';
import { EventMeetingDialog } from './EventMeetingDialog';
import { meetingRowDetail, meetingRowLabel } from './meetingPlanLabels';

/** Same anatomy as EventLogisticsCard's own rows, so the card reads as one list. */
function MeetingRow({
  icon,
  label,
  detail,
  action,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 border-b border-border p-3.5 last:border-b-0">
      <Text
        as="span"
        variant="body"
        tone="structure"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-green-tint"
      >
        {icon}
      </Text>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <Text as="span" variant="label" size="sm" className="tabular break-words font-bold">
          {label}
        </Text>
        <Text as="span" variant="meta" size="xs" className="break-words">
          {detail}
        </Text>
      </div>
      {action && <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * The match-day timing rows under the venue in EventLogisticsCard: when to be
 * at the gym, and — when a meeting point exists — where and when the group
 * meets. Renders nothing for a training (no plan).
 */
export function EventMeetingRows({
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
  const [isAdjusting, setIsAdjusting] = useState(false);
  const plan = event.meetingPlan;
  if (!plan) return null;

  return (
    <>
      {plan.meetingPoint && (
        <MeetingRow
          icon={<MapPinIcon size={19} />}
          label={meetingRowLabel(plan)}
          detail={meetingRowDetail(plan)}
          action={
            <>
              <Button asChild variant="outline" size="sm">
                <a
                  href={eventItineraryHref(plan.meetingPoint.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="gap-1.5"
                  aria-label="Itinéraire vers le point de rendez-vous"
                >
                  <RouteIcon className="h-4 w-4 shrink-0" />
                  Itinéraire
                </a>
              </Button>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setIsAdjusting(true)}>
                  Ajuster
                </Button>
              )}
            </>
          }
        />
      )}
      <MeetingRow
        icon={<ClockIcon size={19} />}
        label={`Arrivée à la salle · ${formatEventTime(plan.arrivalAt)}`}
        detail={`${plan.arrivalBufferMinutes} min avant le coup d’envoi`}
        action={
          canManage && !plan.meetingPoint ? (
            <Button variant="ghost" size="sm" onClick={() => setIsAdjusting(true)}>
              Ajouter un RDV
            </Button>
          ) : undefined
        }
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
    </>
  );
}
