import type { ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { formatEventDate, formatEventDateOnly, formatEventTime } from '../clubs/eventDateFormat';
import { EventVenueBadge } from '../clubs/EventVenueBadge';
import { EventRsvpControl } from '../clubs/EventRsvpControl';
import { teamAvatarInitials } from '../clubs/matchDetailLabels';
import { useEventShow } from '../clubs/useEventShow';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { useTeamShow } from '../clubs/useTeamShow';

type MatchDetailTab = 'apercu';

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border bg-surface-2 p-3.5">
      <span className="mt-0.5 shrink-0 text-blue-green">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold uppercase tracking-wide-caps text-muted">{label}</span>
        <span className="tabular text-sm text-charcoal">{value}</span>
      </div>
    </div>
  );
}

export function MatchDetailPage() {
  const { clubId, teamId, eventId } = useParams<{
    clubId: string;
    teamId: string;
    eventId: string;
  }>();
  // Only one tab exists in this phase — the ?tab= param is still wired up
  // (read/write) so Phases 2-5 can add Effectif/Vote/Feuille de match
  // without re-plumbing the URL convention TeamDetailPage already
  // establishes for tabs.
  const [, setSearchParams] = useSearchParams();
  const activeTab: MatchDetailTab = 'apercu';

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
          icon={<TrophyIcon className="h-8 w-8 text-muted" />}
          title="Match introuvable"
          description="Ce match n’existe plus ou a été supprimé."
          action={
            <Button asChild>
              <Link to={`/clubs/${clubId}/teams/${teamId}?tab=events`}>{team?.name}</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // This page only exists for MATCH events — a TRAINING id lands back on the
  // team's Événements tab rather than rendering an empty/broken shell.
  if (event.type !== 'MATCH') {
    return <Navigate to={`/clubs/${clubId}/teams/${teamId}?tab=events`} replace />;
  }

  return (
    <PageContainer size="lg">
      <Button asChild variant="ghost" className="self-start">
        <Link to={`/clubs/${clubId}/teams/${teamId}?tab=events`}>← {team.name}</Link>
      </Button>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Heading as="h1" className="m-0">
            {team.name} vs {event.opponentName}
          </Heading>
          {event.venue && <EventVenueBadge venue={event.venue} />}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge>Match</Badge>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-lg border border-border shadow-md">
        <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 bg-blue-green px-2 py-5 text-cream sm:w-36">
          {event.timeConfirmed ? (
            <span className="tabular font-heading text-4xl font-extrabold leading-none">
              {formatEventTime(event.startsAt)}
            </span>
          ) : (
            <span className="font-heading text-sm font-extrabold uppercase leading-none tracking-wide-caps">
              à confirmer
            </span>
          )}
          <span className="font-heading text-xs font-bold uppercase tracking-wide-caps opacity-85">
            Match
          </span>
        </div>
        <div className="flex flex-grow flex-col gap-3.5 bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Avatar>
                <AvatarFallback>{teamAvatarInitials(team.name)}</AvatarFallback>
              </Avatar>
              <span className="font-heading text-xl font-extrabold">{team.name}</span>
            </div>
            <span className="font-heading text-base font-bold tracking-wide text-muted">VS</span>
            <div className="flex items-center gap-3.5">
              <span className="font-heading text-xl font-extrabold">{event.opponentName}</span>
              <Avatar>
                <AvatarFallback className="border-2 border-dashed border-border-strong bg-sunk text-muted">
                  ?
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center gap-2 text-sm text-muted">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="#1E5F74"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {event.location}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {isRostered && event.myConvocation && (
          <Badge variant="outline" className="w-fit gap-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3 shrink-0"
            >
              <rect x="6" y="4" width="12" height="17" rx="1.5" />
              <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
              <path d="M9 11.5l2 2 4-4.5" />
            </svg>
            Convoqué par le coach
          </Badge>
        )}
        {isRostered && <EventRsvpControl clubId={clubId!} teamId={teamId!} event={event} />}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setSearchParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="apercu">Aperçu</TabsTrigger>
        </TabsList>

        <TabsContent value="apercu" className="mt-4 flex flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <SectionHeading>Informations pratiques</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoTile
                label="Date & heure"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M3 10h18" />
                    <path d="M8 3v4" />
                    <path d="M16 3v4" />
                  </svg>
                }
                value={
                  event.timeConfirmed ? (
                    formatEventDate(event.startsAt)
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      {formatEventDateOnly(event.startsAt)}
                      <Badge variant="outline">Heure à confirmer</Badge>
                    </div>
                  )
                }
              />
              <InfoTile
                label="Lieu"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                }
                value={event.location}
              />
              <InfoTile
                label="Adversaire"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3v18" />
                    <path d="M3 12h18" />
                    <path d="M5.5 5.5c2 2.2 3 4.8 3 6.5s-1 4.3-3 6.5" />
                    <path d="M18.5 5.5c-2 2.2-3 4.8-3 6.5s1 4.3 3 6.5" />
                  </svg>
                }
                value={event.opponentName}
              />
              {event.notes && (
                <InfoTile
                  label="Notes"
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    >
                      <path d="M4 20h16M4 20V9l8-5 8 5v11M9 20v-6h6v6" />
                    </svg>
                  }
                  value={event.notes}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
