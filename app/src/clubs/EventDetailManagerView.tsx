import { useState } from 'react';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
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
import { EVENT_SECTION_IDS } from './useEventSectionAnchor';
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
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  teamName: string;
  isRostered: boolean;
  showVote: boolean;
  /** Opened from a « à partager » notification: bring the share card into focus. */
  focusShare?: boolean;
}) {
  const isMatch = event.type === 'MATCH';
  const isUpcoming = new Date(event.startsAt) > new Date();
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <>
      <EventDetailHero event={event} teamName={teamName} />

      <EventPilotBand
        clubId={clubId}
        teamId={teamId}
        event={event}
        id={EVENT_SECTION_IDS.decision}
      />

      {isRostered && <CoachOwnRsvpCard clubId={clubId} teamId={teamId} event={event} />}

      <section id={EVENT_SECTION_IDS.logistique} className="flex scroll-mt-20 flex-col gap-3.5">
        <SectionHeading as="h2">Logistique</SectionHeading>
        <EventLogisticsCard
          clubId={clubId}
          teamId={teamId}
          event={event}
          canManage
          isRostered={isRostered}
        />
      </section>

      {isUpcoming && (
        <section id={EVENT_SECTION_IDS.partage} className="flex scroll-mt-20 flex-col gap-3.5">
          <SectionHeading as="h2">Partage WhatsApp</SectionHeading>
          <WhatsAppShareCard
            clubId={clubId}
            teamId={teamId}
            eventId={event.id}
            initialShare={event.whatsAppShare}
            reminderEnabled={event.whatsAppSettings?.effective.enabled ?? null}
            focusOnLoad={focusShare}
          />
        </section>
      )}

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

      <section id={EVENT_SECTION_IDS.presences} className="flex scroll-mt-20 flex-col gap-3.5">
        <SectionHeading as="h2">
          {isMatch ? 'Effectif de la rencontre' : 'Effectif de la séance'}
        </SectionHeading>
        <EventRosterList
          clubId={clubId}
          teamId={teamId}
          eventId={event.id}
          meetingPlan={event.meetingPlan}
        />
      </section>

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
            canManage
          />
        </section>
      )}

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
