import { useEffect, useState } from 'react';
import { Card } from '@basketeasy/ui/card';
import { SectionAccordion, SectionAccordionItem } from '@basketeasy/ui/section-accordion';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import type { TeamEvent } from '@basketeasy/types/events';
import { EventDeleteModal } from './EventDeleteModal';
import { EventDetailHero } from './EventDetailHero';
import { EventEditModal } from './EventEditModal';
import { EventLogisticsCard } from './EventLogisticsCard';
import { EventPilotBand } from './EventPilotBand';
import { EventRosterList } from './EventRosterList';
import { EventRsvpControl } from './EventRsvpControl';
import { MatchScoresheetTab } from './MatchScoresheetTab';
import { MatchVoteTab } from './MatchVoteTab';
import { hasVoteWindowClosed, isVoteWindowOpen } from './voteWindow';
import { EVENT_SECTION_IDS, EVENT_SECTION_SCROLL_MARGIN } from './useEventSectionAnchor';
import { EventTravelModeControl } from '../meeting-points/EventTravelModeControl';
import { WhatsAppShareCard } from '../whatsapp-reminders/WhatsAppShareCard';

/**
 * The double role of `player-journey.md` §1.3, finally visible.
 *
 * Inès coaches the seniors *and* turns out for them when they are short:
 * `canManage` and `isRostered` have always been resolved independently, but
 * nothing in the UI said so — her own RSVP control rendered in exactly the
 * spot a player's does, with no signal that it was hers rather than one more
 * management widget. Here it sits under the pilot band, labelled, so the two
 * hats are two blocks instead of one ambiguous one.
 */
function CoachOwnRsvpCard({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  return (
    <Card variant="inset" className="flex flex-col gap-2">
      <Text variant="label" size="sm">
        Et vous&nbsp;? Vous êtes aussi sur l’effectif de cette équipe.
      </Text>
      <EventRsvpControl clubId={clubId} teamId={teamId} event={event} />
      <EventTravelModeControl clubId={clubId} teamId={teamId} event={event} divided={false} />
    </Card>
  );
}

const SHARE_SUMMARY: Record<string, string> = {
  PENDING: 'Message à partager',
  SCHEDULED: 'Programmé',
  SENT: 'Envoyé',
};

/** Each summary comes from the `TeamEvent` the page already holds: a closed item runs no query of its own. */
function voteSummary(startsAt: string): string | undefined {
  if (hasVoteWindowClosed(startsAt)) return 'Résultats';
  if (isVoteWindowOpen(startsAt)) return 'Vote ouvert';
  return 'Ouvre après le match';
}

function notesSummary(notes: string): string {
  return notes.split('\n')[0]!;
}

/**
 * The event page as the person running the team reads it: the same data as
 * before, regrouped by *when it is used* rather than by tab.
 *
 * Before the event: what it is (hero), who is in the group and who is silent
 * (pilot band), my own answer if I am also rostered, where it is and who
 * carries the kit (logistique), what the squad has replied one by one
 * (effectif). After it: the scoresheet, and the vote.
 *
 * **Nothing is removed.** The four `?tab=` panels each kept their content and
 * their entry point — Aperçu split between the hero and the logistique card,
 * Effectif became the pilot band plus the roster list, Vote and Feuille de
 * match became the last two blocks — and Modifier / Supprimer / Gérer la
 * convocation are all still one tap away. What changed is that a coach no
 * longer has to know which tab holds the answer to "ai-je un groupe pour
 * samedi ?": it is the first thing under the hero.
 */
export function EventDetailManagerView({
  clubId,
  teamId,
  event,
  teamName,
  isRostered,
  showVote,
  focusShare = false,
  openSection = null,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  teamName: string;
  isRostered: boolean;
  showVote: boolean;
  /** Opened from a « à partager » notification: bring the share card into focus. */
  focusShare?: boolean;
  /** The accordion item an incoming deep link names (`?tab=`, `?partage=`): opened, never closed again by this prop. */
  openSection?: string | null;
}) {
  const isMatch = event.type === 'MATCH';
  const isUpcoming = new Date(event.startsAt) > new Date();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();
  // Seeded from the anchor, never written back to the URL (`?tab=` is read-only).
  const initialOpen = () => [
    ...(isDesktop ? [] : [EVENT_SECTION_IDS.presences]),
    ...(openSection ? [openSection] : []),
  ];
  const [open, setOpen] = useState<string[]>(initialOpen);
  useEffect(() => {
    setOpen(initialOpen());
    // A new event in the same mounted page starts from its own defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);
  useEffect(() => {
    if (openSection)
      setOpen((current) => (current.includes(openSection) ? current : [...current, openSection]));
  }, [openSection]);
  const scroll = EVENT_SECTION_SCROLL_MARGIN;

  const presencesHeading = 'Présences';
  const roster = (
    <EventRosterList
      clubId={clubId}
      teamId={teamId}
      eventId={event.id}
      meetingPlan={event.meetingPlan}
    />
  );
  const logistics = (
    <section id={EVENT_SECTION_IDS.logistique} className={`flex flex-col gap-3.5 ${scroll}`}>
      <SectionHeading as="h2">Logistique</SectionHeading>
      <EventLogisticsCard
        clubId={clubId}
        teamId={teamId}
        event={event}
        canManage
        isRostered={isRostered}
        stacked={isDesktop}
      />
    </section>
  );
  const share = event.whatsAppShare ? SHARE_SUMMARY[event.whatsAppShare.state] : undefined;

  return (
    <>
      <EventDetailHero
        clubId={clubId}
        teamId={teamId}
        event={event}
        teamName={teamName}
        canManage
      />

      <EventPilotBand
        clubId={clubId}
        teamId={teamId}
        event={event}
        id={EVENT_SECTION_IDS.decision}
      />

      {isRostered && <CoachOwnRsvpCard clubId={clubId} teamId={teamId} event={event} />}

      {isDesktop ? (
        <div className="grid grid-cols-2 items-start gap-6">
          {logistics}
          <section id={EVENT_SECTION_IDS.presences} className={`flex flex-col gap-3.5 ${scroll}`}>
            <SectionHeading as="h2">{presencesHeading}</SectionHeading>
            <Card className="p-4">{roster}</Card>
          </section>
        </div>
      ) : (
        logistics
      )}

      <SectionAccordion value={open} onValueChange={setOpen}>
        {!isDesktop && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.presences}
            id={EVENT_SECTION_IDS.presences}
            title={presencesHeading}
            summary={`${event.rsvpSummary.going} / ${event.rsvpSummary.answering}`}
            summaryLabel={`${event.rsvpSummary.going} présents sur ${event.rsvpSummary.answering}`}
            className={scroll}
          >
            {roster}
          </SectionAccordionItem>
        )}
        {isUpcoming && (
          <SectionAccordionItem
            value={EVENT_SECTION_IDS.partage}
            id={EVENT_SECTION_IDS.partage}
            title="Partage WhatsApp"
            summary={share}
            className={scroll}
          >
            <WhatsAppShareCard
              clubId={clubId}
              teamId={teamId}
              eventId={event.id}
              initialShare={event.whatsAppShare}
              reminderEnabled={event.whatsAppSettings?.effective.enabled ?? null}
              focusOnLoad={focusShare}
            />
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
        {showVote && (
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
            summary={
              event.result ? (
                <span className="tabular">
                  {event.result.ourScore} – {event.result.theirScore}
                </span>
              ) : undefined
            }
            className={scroll}
          >
            <MatchScoresheetTab
              clubId={clubId}
              teamId={teamId}
              event={event}
              isRostered={isRostered}
              canManage
            />
          </SectionAccordionItem>
        )}
      </SectionAccordion>

      {/* Last, not first: editing the event itself is the rarest thing a
          manager does on this page, and the mockup puts it at the foot for
          that reason. Both are dialogs, per CLAUDE.md — a multi-field edit
          and an irreversible delete. */}
      <div className="flex flex-wrap items-center gap-2">
        <EventEditModal
          clubId={clubId}
          teamId={teamId}
          event={event}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
        <EventDeleteModal clubId={clubId} teamId={teamId} event={event} />
      </div>
    </>
  );
}
