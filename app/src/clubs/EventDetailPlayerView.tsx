import { SectionAccordion, SectionAccordionItem } from '@basketeasy/ui/section-accordion';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import type { TeamEvent } from '@basketeasy/types/events';
import { EventAttendanceSection } from './EventAttendanceSection';
import { EventDecisionBand } from './EventDecisionBand';
import { EventDetailHero } from './EventDetailHero';
import { EventLogisticsCard } from './EventLogisticsCard';
import { MatchScoresheetTab } from './MatchScoresheetTab';
import { MatchStatsTable } from './MatchStatsTable';
import { MatchVoteTab } from './MatchVoteTab';
import { useEventRoster } from './useEventRoster';
import { notesSummary, resultSummary, voteSummary } from './eventSectionSummaries';
import {
  EVENT_SECTION_IDS,
  EVENT_SECTION_SCROLL_MARGIN,
  useEventOpenSections,
} from './useEventSectionAnchor';
import { isVoteWindowOpen } from './voteWindow';

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
  childName = null,
  openSection = null,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  teamName: string;
  isRostered: boolean;
  showVote: boolean;
  /**
   * Set when a parent reads their child's match. They answer and choose the
   * trip for the child, and nothing else: voting, taking the jerseys or
   * uploading the scoresheet stay the player's own (design decision 9).
   */
  childName?: string | null;
  /** The accordion item an incoming `?tab=` deep link names: opened, never closed again by this prop. */
  openSection?: string | null;
}) {
  const isActingForChild = childName !== null;
  const canActAsPlayer = isRostered && !isActingForChild;
  const isMatch = event.type === 'MATCH';
  // Read here purely for the decision band's "dans le groupe des 12" — the
  // block below owns the error/loading/empty ladder for this same (deduped)
  // query, and the sentence degrades to its count-less form until it lands.
  const { counts } = useEventRoster(clubId, teamId, event.id);
  const isDesktop = useIsDesktopViewport();
  const canVote = showVote && !isActingForChild;
  // A ballot the reader owes must not sit behind a fold.
  const [open, setOpen] = useEventOpenSections({
    eventId: event.id,
    isDesktop,
    openSection,
    extra: canVote && isVoteWindowOpen(event.startsAt) ? [EVENT_SECTION_IDS.vote] : [],
  });
  const scroll = EVENT_SECTION_SCROLL_MARGIN;

  const logistics = (
    <section id={EVENT_SECTION_IDS.logistique} className={`flex flex-col gap-3.5 ${scroll}`}>
      <SectionHeading as="h2">S’y rendre</SectionHeading>
      <EventLogisticsCard
        clubId={clubId}
        teamId={teamId}
        event={event}
        canManage={false}
        isRostered={canActAsPlayer}
        stacked={isDesktop}
      />
    </section>
  );
  const attendance = (
    <EventAttendanceSection
      clubId={clubId}
      teamId={teamId}
      eventId={event.id}
      meetingPlan={event.meetingPlan}
      id={isDesktop ? EVENT_SECTION_IDS.presences : undefined}
      headingless={!isDesktop}
    />
  );

  return (
    <>
      <EventDetailHero
        clubId={clubId}
        teamId={teamId}
        event={event}
        teamName={teamName}
        canManage={false}
      />

      {isRostered && (
        <EventDecisionBand
          clubId={clubId}
          teamId={teamId}
          event={event}
          counts={counts}
          id={EVENT_SECTION_IDS.decision}
          childName={childName}
        />
      )}

      {isDesktop ? (
        <div className="grid grid-cols-2 items-start gap-6">
          {logistics}
          {attendance}
        </div>
      ) : (
        logistics
      )}

      <SectionAccordion value={open} onValueChange={setOpen}>
        {!isDesktop && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.presences}
            id={EVENT_SECTION_IDS.presences}
            title="Qui vient&nbsp;?"
            summary={counts ? `${counts.going} / ${counts.answering}` : undefined}
            summaryLabel={counts ? `${counts.going} présents sur ${counts.answering}` : undefined}
            className={scroll}
          >
            {attendance}
          </SectionAccordionItem>
        )}
        {event.notes && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.notes}
            id={EVENT_SECTION_IDS.notes}
            title="Notes du coach"
            summary={notesSummary(event.notes)}
            className={scroll}
          >
            <Text variant="meta" size="sm" className="whitespace-pre-line">
              {event.notes}
            </Text>
          </SectionAccordionItem>
        )}
        {canVote && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.vote}
            id={EVENT_SECTION_IDS.vote}
            title="Vote du match"
            summary={voteSummary(event.startsAt)}
            className={scroll}
          >
            <MatchVoteTab clubId={clubId} teamId={teamId} event={event} />
          </SectionAccordionItem>
        )}
        {isMatch && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.apresLaRencontre}
            id={EVENT_SECTION_IDS.apresLaRencontre}
            title="Après la rencontre"
            summary={resultSummary(event.result)}
            className={scroll}
          >
            <div className="flex flex-col gap-3.5">
              <MatchStatsTable
                clubId={clubId}
                teamId={teamId}
                eventId={event.id}
                hasStarted={new Date(event.startsAt) <= new Date()}
              />
              <MatchScoresheetTab
                clubId={clubId}
                teamId={teamId}
                event={event}
                isRostered={canActAsPlayer}
                canManage={false}
              />
            </div>
          </SectionAccordionItem>
        )}
      </SectionAccordion>
    </>
  );
}
