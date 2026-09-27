import { useId } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { Divider } from '@basketeasy/ui/divider';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponseMeter } from '@basketeasy/ui/response-meter';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@basketeasy/ui/tooltip';
import { BellIcon } from '@basketeasy/ui/icons/bell';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { TeamEvent } from '@basketeasy/types/events';
import { ConvocationIcon } from './eventDetailIcons';
import { EventConvocationModal } from './EventConvocationModal';
import { eventCountdownLabel } from './eventDateFormat';
import { useEventRoster, type EventRosterCounts } from './useEventRoster';

/**
 * Nothing sends a reminder yet: no mailer and no scheduled job exist in
 * `server/src`, and the BullMQ "scheduled reminders" of
 * `docs/architecture.md` are unbuilt. That is `player-journey.md` §6.7 and
 * the implementation plan's phase 10+, deliberately *not* this phase.
 *
 * The button ships disabled rather than hidden because the gap it names is
 * the single most consequential one on this screen — a coach reading "2 sans
 * réponse" needs to know whether the app will chase them (it will not, yet)
 * or whether that is still a text message they have to send themselves.
 * Hiding it would answer that question wrongly by omission.
 */
const REMINDER_HINT =
  'Les relances automatiques arrivent dans une prochaine version. En attendant, contactez directement les joueurs sans réponse.';

function ReminderAction({ pending }: { pending: number }) {
  const hintId = useId();
  return (
    <TooltipProvider>
      <Tooltip>
        {/* The trigger is the wrapper, not the button: a disabled button gets
            `pointer-events-none`, so it never fires the hover that opens a
            tooltip. The wrapper stays focusable (and carries the shared focus
            ring) so the hint is reachable from the keyboard too, and the
            button itself is described by an always-rendered copy of it — the
            tooltip lives in a portal that only exists while open. */}
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('inline-flex rounded-md', focusRing)}>
            <Button variant="outline" size="sm" disabled aria-describedby={hintId}>
              <BellIcon className="h-4 w-4 shrink-0" />
              Relancer les {pending} sans réponse
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{REMINDER_HINT}</TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {REMINDER_HINT}
      </span>
    </TooltipProvider>
  );
}

function PilotSummary({ counts, event }: { counts: EventRosterCounts; event: TeamEvent }) {
  const countdown = eventCountdownLabel(event.startsAt);
  const travel = event.meetingPlan?.meetingPoint ? counts.travel : null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="solid" tone="structure" size="md" className="gap-1.5">
          <ConvocationIcon size={13} className="shrink-0" />
          {counts.convoked} convoqué·es
        </Badge>
        {counts.pending > 0 && (
          <Badge variant="soft" tone="brand">
            {counts.pending} sans réponse
          </Badge>
        )}
        {countdown && (
          <Text as="span" variant="meta" size="xs" className="tabular ml-auto">
            {countdown}
          </Text>
        )}
      </div>
      <ResponseMeter
        going={counts.going}
        maybe={counts.maybe}
        notGoing={counts.notGoing}
        pending={counts.pending}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Text as="span" variant="meta" size="xs" className="tabular">
          {counts.going} oui · {counts.maybe} peut-être · {counts.notGoing} non · {counts.pending}{' '}
          sans réponse
        </Text>
        {travel && (
          <>
            <Divider orientation="vertical" className="h-4 self-center" />
            <Text as="span" variant="label" size="xs" tone="structure" className="tabular">
              {travel.meetingPoint} au RDV · {travel.direct} en direct
            </Text>
          </>
        )}
      </div>
    </>
  );
}

/**
 * The manager's counterpart to the player's decision band: who is in the
 * group, who has not answered, and the two actions that unblock the week.
 *
 * Those counts used to live one tab away, inside « Effectif », behind a
 * collapsible breakdown that fetched on expand (`player-journey.md` §3.8) —
 * so the first thing a coach opens the page to learn ("ai-je un cinq
 * majeur ?") cost a tap and a wait. Here it is the block directly under the
 * hero, on the same query the roster list below it already runs.
 *
 * The actions row renders whatever the roster query does: « Modifier la
 * convocation » opens the existing dialog, which fetches its own roster, so
 * a failed breakdown must not take the one control that fixes the group down
 * with it.
 */
export function EventPilotBand({
  clubId,
  teamId,
  event,
  id,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  id?: string;
}) {
  const { rows, counts, isError, isLoading, retry } = useEventRoster(clubId, teamId, event.id);

  const summary = () => {
    if (isError) {
      return <QueryError onRetry={retry} />;
    }
    if (isLoading || !rows || !counts) {
      return <SkeletonList rows={1} variant="card" />;
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<UsersIcon tone="secondary" className="h-8 w-8" />}
          title="Effectif vide"
          description="Ajoutez des joueurs à l’équipe pour pouvoir composer un groupe."
        />
      );
    }
    return <PilotSummary counts={counts} event={event} />;
  };

  return (
    <Card id={id} variant="panel" className="flex scroll-mt-20 flex-col gap-2.5">
      {summary()}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <EventConvocationModal
          clubId={clubId}
          teamId={teamId}
          eventId={event.id}
          triggerVariant="default"
          triggerLabel={
            counts?.isConvocationScoped ? 'Modifier la convocation' : 'Convoquer le groupe'
          }
        />
        {counts && counts.pending > 0 && <ReminderAction pending={counts.pending} />}
      </div>
    </Card>
  );
}
