import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Check } from '@basketeasy/ui/icons/check';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventLogisticsField, TeamEvent } from '@basketeasy/types/events';
import { getClubErrorMessage } from './clubErrorMessages';
import { BallIcon, JerseyIcon } from './eventLogisticsIcons';
import { eventLogisticsFieldLabel, eventLogisticsFieldQuestion } from './eventLogisticsLabels';
import { getInitials } from './getInitials';
import { useEventConvocations } from './useEventConvocations';
import { useEventLogisticsSet } from './useEventLogisticsSet';
import { IconBadge } from '@basketeasy/ui/icon-badge';
import { Text } from '@basketeasy/ui/text';
import { EventMatchTimeline } from '../meeting-points/EventMatchTimeline';

const FIELD_ICON: Record<EventLogisticsField, typeof JerseyIcon> = {
  JERSEYS: JerseyIcon,
  BALLS: BallIcon,
};

// Radix Select forbids an empty-string item value, and "clear the
// assignment" needs a selectable option of its own (the current assignee,
// or a manager, picking "Non assigné" from the same list rather than a
// separate button) — this sentinel stands in for null on the wire.
const UNASSIGNED_VALUE = '__unassigned__';

function LogisticsFieldRow({
  clubId,
  teamId,
  event,
  field,
  myTeamPlayerId,
  canManage,
  isRostered,
  rosterOptions,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  field: EventLogisticsField;
  myTeamPlayerId: string | null;
  canManage: boolean;
  isRostered: boolean;
  rosterOptions: { value: string; label: string }[];
}) {
  const [isChanging, setIsChanging] = useState(false);
  const { mutate: setLogistics, isPending } = useEventLogisticsSet(clubId, teamId);
  const assignee = field === 'JERSEYS' ? event.logistics.jerseys : event.logistics.balls;
  const isAssignedToMe = assignee?.teamPlayerId === myTeamPlayerId;
  const canChange = canManage || isAssignedToMe;
  const Icon = FIELD_ICON[field];
  const fieldLabel = eventLogisticsFieldLabel(field, event.type);

  const handleChange = (value: string) => {
    setLogistics(
      { eventId: event.id, field, teamPlayerId: value === UNASSIGNED_VALUE ? null : value },
      {
        onSuccess: () => setIsChanging(false),
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
      },
    );
  };

  const handleSelfAssign = () => {
    if (!myTeamPlayerId) {
      return;
    }
    setLogistics(
      { eventId: event.id, field, teamPlayerId: myTeamPlayerId },
      {
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3.5 border-b border-border p-3.5 last:border-b-0">
      <IconBadge>
        <Icon size={19} />
      </IconBadge>
      <div className="flex min-w-0 flex-col gap-px">
        <Text as="span" variant="label" size="sm">
          {fieldLabel}
        </Text>
        <Text as="span" variant="meta" size="xs">
          {eventLogisticsFieldQuestion(field, event.type)}
        </Text>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        {isChanging ? (
          <SelectField
            label={`Assigné·e — ${fieldLabel}`}
            containerClassName="w-full sm:w-52"
            options={[{ value: UNASSIGNED_VALUE, label: 'Non assigné' }, ...rosterOptions]}
            value={assignee?.teamPlayerId ?? UNASSIGNED_VALUE}
            disabled={isPending}
            onValueChange={handleChange}
          />
        ) : assignee ? (
          <>
            <Avatar size="sm">
              <AvatarFallback>{getInitials(assignee.firstName, assignee.lastName)}</AvatarFallback>
            </Avatar>
            <Text as="span" variant="label" size="sm">
              {assignee.firstName} {assignee.lastName}
            </Text>
            <Text
              as="span"
              variant="body"
              tone="inverse"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-success"
            >
              <Check className="h-2.5 w-2.5" />
            </Text>
            {canChange && (
              <Button variant="ghost" size="sm" onClick={() => setIsChanging(true)}>
                Changer
              </Button>
            )}
          </>
        ) : (
          <>
            <Badge variant="outline" tone="muted">
              Non assigné
            </Badge>
            {isRostered && (
              <Button size="sm" loading={isPending} onClick={handleSelfAssign}>
                Je m&apos;en occupe
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Where the event is, and who brings what. Two layouts, chosen by the event
 * type:
 *
 * - a TRAINING is one card, the kit's two rows;
 * - a MATCH reads as its day — `EventMatchTimeline` (meeting point, arrival,
 *   tip-off) beside a « Matériel » card with the kit.
 *
 * The venue and its directions live in the hero (`EventHeroLocation`) for
 * both types, so this card has no venue row.
 *
 * It backs two blocks that ask the same question from opposite ends: the
 * player's « S'y rendre » (how do I get there, and is it me carrying the
 * jerseys?) and the manager's « Logistique » (is the kit covered?). Both were
 * previously split between an `InfoTile` grid and a separate Logistique
 * section, one tab apart from each other.
 *
 * Shared by both event types, since a TRAINING has the same "who's bringing
 * it" need for scrimmage bibs and balls; only the jersey-slot label differs
 * ("Maillots" vs "Chasubles", see `eventLogisticsFieldLabel`). The section
 * heading is the caller's, so each role can name the block for what it does.
 *
 * Reuses `useEventConvocations` for the roster (teamPlayerId/firstName/
 * lastName + `isMe`, already fetched elsewhere in this module for the same
 * shape) rather than a new roster endpoint — fetched eagerly (not lazily,
 * unlike the RSVP/convocation breakdowns) since `isMe` is needed up front
 * just to decide whether to show the "Changer" control at all. That query is
 * deliberately *not* a branch of this card: every row renders from the event
 * itself, and a failed roster fetch only costs the reassignment options.
 */
export function EventLogisticsCard({
  clubId,
  teamId,
  event,
  canManage,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  canManage: boolean;
  isRostered: boolean;
}) {
  const { data: roster } = useEventConvocations(clubId, teamId, event.id, true);

  const myTeamPlayerId = roster?.find((r) => r.isMe)?.teamPlayerId ?? null;
  const rosterOptions = (roster ?? []).map((r) => ({
    value: r.teamPlayerId,
    label: `${r.firstName} ${r.lastName}`,
  }));

  const kitRows = (
    <>
      <LogisticsFieldRow
        clubId={clubId}
        teamId={teamId}
        event={event}
        field="JERSEYS"
        myTeamPlayerId={myTeamPlayerId}
        canManage={canManage}
        isRostered={isRostered}
        rosterOptions={rosterOptions}
      />
      <LogisticsFieldRow
        clubId={clubId}
        teamId={teamId}
        event={event}
        field="BALLS"
        myTeamPlayerId={myTeamPlayerId}
        canManage={canManage}
        isRostered={isRostered}
        rosterOptions={rosterOptions}
      />
    </>
  );

  // Keyed on the type, not on the plan being present: the plan is how a
  // match is drawn, never what makes it one. The API sends a plan for every
  // MATCH, so the second test only narrows the type.
  if (event.type === 'MATCH' && event.meetingPlan) {
    return (
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <EventMatchTimeline
          clubId={clubId}
          teamId={teamId}
          event={event}
          plan={event.meetingPlan}
          canManage={canManage}
        />
        <Card variant="flush">
          {canManage && (
            <div className="border-b border-border px-3.5 pt-4 pb-3">
              <Text variant="label">Matériel</Text>
            </div>
          )}
          {kitRows}
        </Card>
      </div>
    );
  }

  return <Card variant="flush">{kitRows}</Card>;
}
