import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import { EventAttendanceSection } from './EventAttendanceSection';
import { EventDecisionBand } from './EventDecisionBand';
import { EventDetailHero } from './EventDetailHero';
import { EventLogisticsCard } from './EventLogisticsCard';
import { MatchScoresheetTab } from './MatchScoresheetTab';
import { MatchVoteTab } from './MatchVoteTab';
import { useEventRoster } from './useEventRoster';
import { EVENT_SECTION_IDS } from './useEventSectionAnchor';

/**
 * The event page as a player reads it: one scroll, no tabs.
 *
 * Block order is the order the questions are asked (`player-journey.md`
 * §4.3): what and when → am I in, and what do I answer → how do I get there
 * and what am I carrying → is anyone else coming → what did the coach say.
 * The decision comes second because on a 390px screen anything below the
 * hero that is not the answer is a scroll between the player and the one
 * thing they opened the app to do.
 *
 * The four `?tab=` panels are gone; what they held is not. « Effectif »
 * became « Qui vient ? », the vote and the scoresheet became the last two
 * blocks (both only for a MATCH, both under the same conditions the tabs
 * had), and « Aperçu » was split between the hero and « S'y rendre ». Old
 * deep links scroll to the block that absorbed them — see
 * `useEventSectionAnchor`.
 */
export function EventDetailPlayerView({
  clubId,
  teamId,
  event,
  teamName,
  isRostered,
  showVote,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  teamName: string;
  isRostered: boolean;
  showVote: boolean;
}) {
  const isMatch = event.type === 'MATCH';
  // Read here purely for the decision band's "dans le groupe des 12" — the
  // block below owns the error/loading/empty ladder for this same (deduped)
  // query, and the sentence degrades to its count-less form until it lands.
  const { counts } = useEventRoster(clubId, teamId, event.id);

  return (
    <>
      <EventDetailHero event={event} teamName={teamName} />

      {isRostered && (
        <EventDecisionBand
          clubId={clubId}
          teamId={teamId}
          event={event}
          counts={counts}
          id={EVENT_SECTION_IDS.decision}
        />
      )}

      <section id={EVENT_SECTION_IDS.logistique} className="flex scroll-mt-20 flex-col gap-3.5">
        <SectionHeading as="h2">S’y rendre</SectionHeading>
        <EventLogisticsCard
          clubId={clubId}
          teamId={teamId}
          event={event}
          canManage={false}
          isRostered={isRostered}
        />
      </section>

      <EventAttendanceSection
        clubId={clubId}
        teamId={teamId}
        eventId={event.id}
        id={EVENT_SECTION_IDS.presences}
      />

      {event.notes && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2">Notes du coach</SectionHeading>
          <Card variant="inset">
            <Text variant="meta" size="sm" className="whitespace-pre-line">
              {event.notes}
            </Text>
          </Card>
        </section>
      )}

      {showVote && (
        <section id={EVENT_SECTION_IDS.vote} className="flex scroll-mt-20 flex-col gap-3.5">
          <SectionHeading as="h2">Vote du match</SectionHeading>
          <MatchVoteTab clubId={clubId} teamId={teamId} event={event} />
        </section>
      )}

      {isMatch && (
        <section
          id={EVENT_SECTION_IDS.apresLaRencontre}
          className="flex scroll-mt-20 flex-col gap-3.5"
        >
          <SectionHeading as="h2">Après la rencontre</SectionHeading>
          <MatchScoresheetTab
            clubId={clubId}
            teamId={teamId}
            event={event}
            isRostered={isRostered}
            canManage={false}
          />
        </section>
      )}
    </>
  );
}
