import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { AvatarGroup } from '@basketeasy/ui/avatar-group';
import { Badge, type BadgeProps } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponseMeter } from '@basketeasy/ui/response-meter';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { eventRsvpAnswerLabel } from './eventRsvpLabels';
import { getInitials } from './getInitials';
import { useEventRoster, type EventRosterCounts, type EventRosterRow } from './useEventRoster';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { TravelModeBadge } from '../meeting-points/TravelModeBadge';
import { formatEventTime } from './eventDateFormat';
import { useMeSuffix } from '../guardians/useActingAs';
import { EVENT_SECTION_SCROLL_MARGIN } from './useEventSectionAnchor';

/** How many people are listed before the « Voir les N » disclosure. */
const PREVIEW_ROWS = 4;

const RSVP_TONE: Record<EventRsvpStatus, NonNullable<BadgeProps['tone']>> = {
  GOING: 'success',
  MAYBE: 'structure',
  NOT_GOING: 'danger',
};

/**
 * The counts spelled out, in the same order the meter draws them — the meter
 * is `role="img"` and says the same thing to a screen reader, so this line is
 * the sighted reader's copy of it, never the only one.
 */
function attendanceSummary(counts: EventRosterCounts): string {
  const scope = counts.isConvocationScoped
    ? `sur ${counts.answering} convoqué·es`
    : `sur ${counts.answering} inscrit·es`;
  return `${counts.going} oui · ${counts.maybe} peut-être · ${counts.notGoing} non · ${counts.pending} sans réponse — ${scope}`;
}

/**
 * The two travel tiles — how many meet the group, how many go straight to
 * the gym, each with the hour they are expected. They take the avatar row's
 * place on a match with a meeting point: the question there is no longer
 * "who is coming" but "who is in the car".
 */
function TravelTiles({
  travel,
  plan,
}: {
  travel: EventRosterCounts['travel'];
  plan: EventMeetingPlan;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card variant="inset" tone="structure" className="flex flex-col gap-0.5">
        <Text variant="display" size="2xl" tone="structure" className="tabular">
          {travel.meetingPoint}
        </Text>
        <Text variant="meta" size="xs" className="tabular">
          au RDV{plan.meetsAt ? ` · ${formatEventTime(plan.meetsAt)}` : ''}
        </Text>
      </Card>
      <Card variant="inset" className="flex flex-col gap-0.5">
        <Text variant="display" size="2xl" className="tabular">
          {travel.direct}
        </Text>
        <Text variant="meta" size="xs" className="tabular">
          en direct · {formatEventTime(plan.arrivalAt)}
        </Text>
      </Card>
    </div>
  );
}

/**
 * Answered first, and inside each answer the people who are coming first:
 * the question this block exists for is "is there a real session tonight",
 * and the top of the list should answer it without scrolling.
 */
const ORDER: Record<string, number> = { GOING: 0, MAYBE: 1, NOT_GOING: 2, null: 3 };

function sortForDisplay(rows: EventRosterRow[]): EventRosterRow[] {
  return [...rows].sort(
    (a, b) =>
      ORDER[String(a.rsvpStatus)] - ORDER[String(b.rsvpStatus)] ||
      a.lastName.localeCompare(b.lastName, 'fr'),
  );
}

function AttendanceRow({
  row,
  showTravelMode,
  meSuffix,
}: {
  row: EventRosterRow;
  showTravelMode: boolean;
  meSuffix: string;
}) {
  return (
    <li className="flex items-center gap-2.5 border-t border-border py-2.5 first:border-t-0">
      <Avatar size="sm" className="shrink-0">
        <AvatarFallback>{getInitials(row.firstName, row.lastName)}</AvatarFallback>
      </Avatar>
      <Text as="span" variant="label" size="sm" className="min-w-0 break-words">
        {row.firstName} {row.lastName}
        {row.isMe && meSuffix}
      </Text>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {showTravelMode && <TravelModeBadge travelMode={row.travelMode} />}
        {row.rsvpStatus === null ? (
          <Badge variant="outline" tone="muted">
            {eventRsvpAnswerLabel(null)}
          </Badge>
        ) : (
          <Badge variant="soft" tone={RSVP_TONE[row.rsvpStatus]}>
            {eventRsvpAnswerLabel(row.rsvpStatus)}
          </Badge>
        )}
      </span>
    </li>
  );
}

/**
 * « Qui vient ? » — the player's answer to "is anyone else actually coming".
 *
 * It used to be the **Effectif** tab: a word that names the squad, one tap
 * away, with the proportions hidden inside a collapsible breakdown that
 * fetched on expand (`player-journey.md` §3.8). Here it is a block on the
 * page, and the counts are read off the same roster call that draws the list.
 *
 * The counts come from `useEventRoster` (the two existing per-event roster
 * endpoints) rather than an aggregate on the event: that aggregate is what
 * the *list* contexts need — one number per row, without a fetch per row —
 * and it lands with phase 7. On a single event page the roster is already
 * being fetched, and it carries the names this block also shows.
 */
export function EventAttendanceSection({
  clubId,
  teamId,
  eventId,
  meetingPlan = null,
  id,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  /** A match with a meeting point: who comes to the RDV and who goes direct. */
  meetingPlan?: EventMeetingPlan | null;
  id?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const { rows, counts, isError, isLoading, retry } = useEventRoster(clubId, teamId, eventId);
  const meSuffix = useMeSuffix(teamId);
  const travelPlan = meetingPlan?.meetingPoint ? meetingPlan : null;
  const showTravelMode = travelPlan !== null;

  const body = () => {
    if (isError) {
      return <QueryError onRetry={retry} />;
    }
    if (isLoading || !rows || !counts) {
      return <SkeletonList rows={2} variant="card" />;
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<UsersIcon tone="secondary" className="h-8 w-8" />}
          title="Effectif vide"
          description="Personne n’est encore inscrit sur cette équipe."
        />
      );
    }

    // Whoever the counts are about: the convoked group once one exists, the
    // whole roster before that — so the list never contradicts the meter.
    const listed = sortForDisplay(
      counts.isConvocationScoped ? rows.filter((r) => r.convoked) : rows,
    );
    const going = listed.filter((row) => row.rsvpStatus === 'GOING');
    const visible = showAll ? listed : listed.slice(0, PREVIEW_ROWS);

    return (
      <Card variant="flush">
        <div className="flex flex-col gap-2.5 p-3.5">
          <Text as="span" variant="meta" size="xs" className="tabular">
            {attendanceSummary(counts)}
          </Text>
          <ResponseMeter
            going={counts.going}
            maybe={counts.maybe}
            notGoing={counts.notGoing}
            pending={counts.pending}
          />
          {travelPlan ? (
            <TravelTiles travel={counts.travel} plan={travelPlan} />
          ) : (
            going.length > 0 && <AvatarGroup people={going} max={6} className="pt-0.5" />
          )}
        </div>
        <div className="border-t border-border px-3.5">
          <ul className="flex flex-col">
            {visible.map((row) => (
              <AttendanceRow
                key={row.teamPlayerId}
                row={row}
                showTravelMode={showTravelMode}
                meSuffix={meSuffix}
              />
            ))}
          </ul>
        </div>
        {listed.length > PREVIEW_ROWS && (
          <div className="border-t border-border p-1.5 text-center">
            {/* A disclosure, not a link: the tab this list used to live in is
                gone, so there is no other page left to send anyone to. */}
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? 'Masquer la liste'
                : `Voir les ${listed.length} ${counts.isConvocationScoped ? 'convoqué·es' : 'inscrit·es'}`}
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <section id={id} className={`flex flex-col gap-3.5 ${EVENT_SECTION_SCROLL_MARGIN}`}>
      <SectionHeading as="h2">Qui vient&nbsp;?</SectionHeading>
      {body()}
    </section>
  );
}
