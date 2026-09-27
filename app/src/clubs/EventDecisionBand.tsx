import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import { ConvocationIcon } from './eventDetailIcons';
import { EventRsvpControl } from './EventRsvpControl';
import { eventRsvpAnswerLabel } from './eventRsvpLabels';
import type { EventRosterCounts } from './useEventRoster';
import { EventTravelModeControl } from '../meeting-points/EventTravelModeControl';

/**
 * Says what the call-up *means*, in a sentence.
 *
 * `myConvocation` is a bare boolean (`events.ts:36`), so a badge reading
 * "Convoqué par le coach" was the whole answer the page gave: it never said
 * out of how many, and the player had to open the Effectif tab to find out
 * whether the group was 12 or the whole club. The count comes from the roster
 * the « Qui vient ? » block already fetches, and degrades to the plain
 * sentence when that fetch has not landed (or failed) — the convocation fact
 * itself is on the event, so it never depends on the roster call.
 *
 * There is no deadline in the copy: `Event` has no `rsvpDeadline` column
 * (`schema.prisma:185-207`) and inventing one in the UI would be a promise
 * the product cannot keep. It is `player-journey.md` §6.3, phase 10+.
 */
function convocationSentence(event: TeamEvent, counts: EventRosterCounts | null): string {
  const occasion = event.type === 'MATCH' ? 'cette rencontre' : 'cette séance';
  if (event.myConvocation) {
    return counts?.isConvocationScoped
      ? `Le coach vous a retenu·e dans le groupe des ${counts.convoked} pour ${occasion}.`
      : `Le coach vous a retenu·e dans le groupe pour ${occasion}.`;
  }
  if (counts?.isConvocationScoped) {
    return `Vous n’êtes pas dans le groupe des ${counts.convoked} retenu·es pour ${occasion}.`;
  }
  return `Le groupe n’a pas encore été annoncé pour ${occasion}.`;
}

/**
 * The first block after the hero on a player's event page — the convocation
 * stated as a sentence, and the RSVP control right under it.
 *
 * Its whole reason to exist is its position: the badge and the control used
 * to render after the back link, the `<h1>`, a badge row and the hero card
 * (`EventDetailPage.tsx:284-318` before this change), which on a 390px screen
 * meant scrolling before answering the question the page was opened for.
 *
 * Inline, not a dialog: a single-field, low-risk, high-frequency answer, per
 * `CLAUDE.md`'s "Modals vs. inline editing".
 */
export function EventDecisionBand({
  clubId,
  teamId,
  event,
  counts,
  id,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  counts: EventRosterCounts | null;
  id?: string;
}) {
  return (
    <Card
      id={id}
      variant="panel"
      tone={event.myConvocation ? 'brand' : 'neutral'}
      className="flex scroll-mt-20 flex-col gap-2"
    >
      {event.myConvocation && (
        <Badge variant="solid" tone="brand" size="md" className="w-fit gap-1.5">
          <ConvocationIcon size={13} className="shrink-0" />
          Vous êtes convoqué·e
        </Badge>
      )}
      <Text variant="label">{convocationSentence(event, counts)}</Text>
      <Text variant="meta" size="xs">
        {event.myRsvpStatus === null
          ? 'Vous n’avez pas encore répondu.'
          : `Votre réponse : ${eventRsvpAnswerLabel(event.myRsvpStatus).toLowerCase()}.`}
      </Text>
      <EventRsvpControl clubId={clubId} teamId={teamId} event={event} fullWidth className="mt-1" />
      <EventTravelModeControl clubId={clubId} teamId={teamId} event={event} />
    </Card>
  );
}
