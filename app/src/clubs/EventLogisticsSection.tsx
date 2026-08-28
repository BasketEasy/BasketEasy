import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Check } from '@basketeasy/ui/icons/check';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventLogisticsField, TeamEvent } from '@basketeasy/types/events';
import { getClubErrorMessage } from './clubErrorMessages';
import { BallIcon, JerseyIcon } from './eventLogisticsIcons';
import { eventLogisticsFieldLabel, eventLogisticsFieldQuestion } from './eventLogisticsLabels';
import { getInitials } from './getInitials';
import { useEventConvocations } from './useEventConvocations';
import { useEventLogisticsSet } from './useEventLogisticsSet';
import { Text } from '@basketeasy/ui/text';

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
    <div className="flex items-center gap-3.5 border-b border-border p-3.5 last:border-b-0">
      <Text
        as="span"
        variant="body"
        tone="structure"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-green-tint"
      >
        <Icon size={19} />
      </Text>
      <div className="flex flex-col gap-px">
        <Text as="span" variant="label" size="sm" className="font-bold">
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
            containerClassName="w-52"
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
            <Text as="span" variant="label" size="sm" className="whitespace-nowrap">
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
 * Aperçu tab's Logistique section (`Main.dc.html:152-190`) — equipment
 * carrier assignment for an event. Originally MATCH-only; now shared by
 * both event types, since a TRAINING session has the same "who's bringing
 * it" logistics need for scrimmage bibs and balls. Only the jersey-slot
 * label/question differ per type ("Maillots" vs "Chasubles", see
 * eventLogisticsFieldLabel) — the layout and the self-assign/manager-
 * reassign mechanics are identical for both. Reuses `useEventConvocations`
 * for the roster (teamPlayerId/firstName/lastName + `isMe`, already fetched
 * elsewhere in this module for the same shape) rather than a new roster
 * endpoint — fetched eagerly (not lazily, unlike the RSVP/convocation
 * breakdowns) since `isMe` is needed up front just to decide whether to
 * show the "Changer" control at all, before any select is opened.
 */
export function EventLogisticsSection({
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

  return (
    <div className="flex flex-col gap-3.5">
      <SectionHeading>Logistique</SectionHeading>
      <Card variant="flush">
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
      </Card>
    </div>
  );
}
