import { Link } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { StatTile } from '@basketeasy/ui/stat-tile';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { formatAverage, formatCount } from './teamStatsFormat';
import { MY_SEASON_TEAM_LIMIT, type MySeasonSnapshot } from './useMySeasonSnapshots';

function SeasonBlock({ snapshot }: { snapshot: MySeasonSnapshot }) {
  const { team, me } = snapshot;
  const statsHref = `/clubs/${team.clubId}/teams/${team.teamId}?tab=stats`;
  return (
    <Card variant="panel" className="flex flex-col gap-3">
      <Text as="span" variant="eyebrow">
        {team.teamName}
      </Text>
      {snapshot.isError ? (
        <QueryError onRetry={snapshot.refetch} isRetrying={snapshot.isRefetching} />
      ) : snapshot.isLoading ? (
        <SkeletonList rows={1} variant="card" />
      ) : !me || me.gamesPlayed === 0 ? (
        <Text variant="meta">Pas encore de match analysé cette saison.</Text>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            size="sm"
            icon={<CalendarIcon size="md" aria-hidden="true" />}
            label="MJ"
            value={me.gamesPlayed}
          />
          <StatTile
            size="sm"
            icon={<ChartBarsIcon size="md" aria-hidden="true" />}
            label="PTS/M"
            value={formatAverage(me.pointsPerGame)}
          />
          <StatTile
            size="sm"
            icon={<TrophyIcon size="md" aria-hidden="true" />}
            label="Meilleur total"
            value={formatCount(me.seasonHighPoints)}
          />
          <StatTile
            size="sm"
            icon={<TrophyIcon size="md" aria-hidden="true" />}
            label="MVP"
            value={me.mvpAwards}
          />
        </div>
      )}
      <TextLink asChild tone="brand">
        <Link to={statsHref} state={{ origin: { from: 'dashboard' } }} className="self-start">
          Toutes mes stats →
        </Link>
      </TextLink>
    </Card>
  );
}

/**
 * « Ma saison »: the persona's line on each of their first two rostered
 * teams, from the team season endpoint (never re-aggregated here). Only the
 * MVP count, never the « joueur en difficulté » one: that stays on the team's
 * own stats tab. Renders nothing for a reader rostered nowhere.
 */
export function MySeasonSection({
  snapshots,
  teams,
}: {
  snapshots: MySeasonSnapshot[];
  teams: MyTeamSummary[] | undefined;
}) {
  if (snapshots.length === 0) return null;
  const rosteredCount = (teams ?? []).filter((team) => team.rosterRole !== null).length;
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading as="h2">Ma saison</SectionHeading>
      {snapshots.map((snapshot) => (
        <SeasonBlock key={snapshot.team.teamId} snapshot={snapshot} />
      ))}
      {rosteredCount > MY_SEASON_TEAM_LIMIT && (
        <TextLink asChild tone="brand">
          <Link to="/my-teams" className="self-start">
            Voir toutes mes équipes →
          </Link>
        </TextLink>
      )}
    </section>
  );
}
