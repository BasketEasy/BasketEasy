import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { PageBackLink, PageBar } from '../components/PageBar';
import { EventDetailManagerView } from '../clubs/EventDetailManagerView';
import { EventDetailPlayerView } from '../clubs/EventDetailPlayerView';
import { hasVoteWindowClosed } from '../clubs/voteWindow';
import { useEventShow } from '../clubs/useEventShow';
import { EVENT_TAB_ANCHORS, useEventSectionAnchor } from '../clubs/useEventSectionAnchor';
import { useIsTeamManager } from '../clubs/useIsTeamManager';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { useTeamShow } from '../clubs/useTeamShow';
import { useActingAs, useTeamActingAs } from '../guardians/useActingAs';

/**
 * Shared detail page for both event types (MATCH and TRAINING) and both
 * roles. It owns three things and nothing else: the two queries, their
 * `error → loading → empty` ladder, and the `useIsTeamManager()` branch that
 * picks a view. Everything below that line lives in
 * `EventDetailPlayerView` / `EventDetailManagerView`.
 *
 * **The tabs are gone, on purpose, for both roles.** Aperçu / Effectif /
 * Vote / Feuille de match cut one page into four, and the cut ran straight
 * through the question each role opens the page to answer: a player had to
 * scroll past the hero to find the RSVP control and then open a tab named
 * after the squad to see who else was coming (`player-journey.md` §3.6, §3.8),
 * and a coach had to open that same tab to learn whether the group was made.
 * `CLAUDE.md` documents the `?tab=` `TabsTrigger`s on `MembersPage` and
 * `TeamDetailPage` as a deliberate ARIA exception; that exception described
 * how to render tabs correctly, not a promise to keep them here. Both views
 * are one scroll, ordered by when each block is used.
 *
 * The `?tab=` **URLs** still work: a convocation link, a bookmark or a link
 * pasted in a club's group chat carries one, so instead of selecting a tab
 * it now scrolls to the block that absorbed it — same value, same route, same
 * destination (see `useEventSectionAnchor`). It is read, never written: no
 * control on either view puts a `tab` back in the URL.
 */
export function EventDetailPage() {
  const { clubId, teamId, eventId } = useParams<{
    clubId: string;
    teamId: string;
    eventId: string;
  }>();
  const { state: navState } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // `?partage=<shareId>` comes from a « à partager » notification. Captured
  // once, then dropped from the URL so a copied address doesn't carry it.
  const [cameFromShareNotification, setCameFromShareNotification] = useState(() =>
    searchParams.has('partage'),
  );
  // Another event in the same mounted page is a new arrival: forget the last
  // one. Declared before the effect below, so on an event that does carry
  // `partage` the later `true` wins.
  useEffect(() => {
    setCameFromShareNotification(false);
  }, [eventId]);
  useEffect(() => {
    if (!searchParams.has('partage')) return;
    setCameFromShareNotification(true);
    const next = new URLSearchParams(searchParams);
    next.delete('partage');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const anchorTab = searchParams.get('tab') ?? (cameFromShareNotification ? 'partage' : null);
  useEventSectionAnchor(anchorTab);
  const openSection = anchorTab ? (EVENT_TAB_ANCHORS[anchorTab] ?? null) : null;

  const {
    data: event,
    isLoading: isLoadingEvent,
    isError: isEventError,
    refetch: refetchEvent,
  } = useEventShow(clubId!, teamId!, eventId!);
  const {
    data: team,
    isLoading: isLoadingTeam,
    isError: isTeamError,
    refetch: refetchTeam,
  } = useTeamShow(clubId!, teamId!);
  const { data: myTeams } = useMyTeamList();
  const isRostered = myTeams?.some((t) => t.teamId === teamId && t.rosterRole !== null) ?? false;
  const isTeamManager = useIsTeamManager(clubId!, teamId!);
  // A parent reading their child's match sees the child's player view —
  // a guardian link never carries manager rights, whatever the reader holds
  // as themself. On any other team the reader is themself again.
  const { persona } = useActingAs();
  const childName = useTeamActingAs(teamId!) ? (persona?.firstName ?? null) : null;
  const canManage = isTeamManager && childName === null;

  if (isEventError || isTeamError) {
    return (
      <PageContainer size="lg">
        <QueryError onRetry={() => (isEventError ? refetchEvent() : refetchTeam())} />
      </PageContainer>
    );
  }

  if (isLoadingEvent || isLoadingTeam) {
    return (
      <PageContainer size="lg">
        <SkeletonList rows={4} variant="card" />
      </PageContainer>
    );
  }

  if (!event || !team) {
    return (
      <PageContainer size="lg">
        <EmptyState
          icon={<CalendarIcon tone="secondary" className="h-8 w-8" />}
          title="Événement introuvable"
          description="Cet événement n’existe plus ou a été supprimé."
          action={
            <Button asChild>
              <Link to={`/clubs/${clubId}/teams/${teamId}?tab=events`} state={navState}>
                {team?.name}
              </Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // The vote block — not just the ballot inside it — stays hidden unless the
  // viewer can actually vote right now (called up AND marked present) or the
  // vote has already closed, at which point results go public to the whole
  // team. Unchanged from the tab it replaced.
  const canVoteNow = event.myConvocation && event.myRsvpStatus === 'GOING';
  const showVote = event.type === 'MATCH' && (canVoteNow || hasVoteWindowClosed(event.startsAt));

  const backTo = `/clubs/${clubId}/teams/${teamId}?tab=events`;
  return (
    <>
      {/* The origin recorded on the way in (e.g. from the dashboard agenda,
          which now links straight to the event) is handed on to the team
          page, so TeamDetailPage's origin-aware back link still resolves to
          where the journey actually started instead of falling back to
          /my-teams. The bar is full-bleed under the header on a phone, so it
          sits outside the container; the desktop link is inside it. */}
      <PageBar to={backTo} state={navState} title={team.name} />
      <PageContainer size="lg" top="bar">
        <PageBackLink to={backTo} state={navState} title={team.name} />

        {canManage ? (
          <EventDetailManagerView
            clubId={clubId!}
            teamId={teamId!}
            event={event}
            teamName={team.name}
            isRostered={isRostered}
            showVote={showVote}
            focusShare={cameFromShareNotification}
            openSection={openSection}
          />
        ) : (
          <EventDetailPlayerView
            clubId={clubId!}
            teamId={teamId!}
            event={event}
            teamName={team.name}
            isRostered={isRostered}
            showVote={showVote}
            childName={childName}
            openSection={openSection}
          />
        )}
      </PageContainer>
    </>
  );
}
