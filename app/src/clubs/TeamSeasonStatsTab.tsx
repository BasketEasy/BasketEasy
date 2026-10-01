import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { PointsRepartitionBar } from '@basketeasy/ui/points-repartition-bar';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SelectField } from '@basketeasy/ui/select-field';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { StatTile } from '@basketeasy/ui/stat-tile';
import { Text } from '@basketeasy/ui/text';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { TeamSeasonPlayerStats } from '@basketeasy/types/team-stats';
import { getInitials } from './getInitials';
import { useTeamSeasonStats } from './useTeamSeasonStats';
import { AwardBadges, TeamStatsRow } from './TeamStatsRow';
import { emptyRepartitionLabel, formatAverage, formatCount } from './teamStatsFormat';
import { teamMemberRoleLabel } from './teamLabels';

const COLUMNS = [
  'Joueur',
  'MJ',
  'PTS/M',
  'FA/M',
  'Meilleur total PTS',
  'Meilleur total FA',
  'Répartition des points',
  'Distinctions',
] as const;

/** "saison 2026-2027", the way the FFBB labels one. */
function seasonLabel(seasonYear: number): string {
  return `Saison ${seasonYear}-${seasonYear + 1}`;
}

/**
 * The legend doubles as the defence against the one misreading this screen
 * invites: a percentage next to a basketball player's name reads as shooting
 * accuracy to anyone who has seen a box score, and the scoresheet records no
 * attempts at all. So the swatches sit next to a sentence saying what the bar
 * actually is, and the bar itself carries point counts, never percentages.
 */
function RepartitionLegend() {
  const entries = [
    { key: 'three', swatch: 'bg-points-three', label: '3 points' },
    { key: 'two', swatch: 'bg-points-two', label: '2 points' },
    { key: 'free', swatch: 'bg-points-free', label: 'Lancers francs' },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5">
      <Text as="span" variant="meta" className="max-w-2xl">
        La répartition montre{' '}
        <strong className="font-bold text-charcoal">comment les points ont été marqués</strong>, pas
        une adresse&nbsp;: la feuille de match ne consigne que les tirs réussis, jamais les
        tentatives.
      </Text>
      <div className="flex items-center gap-4">
        {entries.map((entry) => (
          <Text key={entry.key} as="span" variant="meta" className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-sm ${entry.swatch}`} />
            {entry.label}
          </Text>
        ))}
      </div>
    </div>
  );
}

/**
 * The requesting player's own season, above the squad ranking — resolved via
 * `isMe` (`TeamSeasonPlayerStats.isMe`, `docs/ux-audit/player-journey.md`
 * §3.10/§6.5: the client cannot derive it, since it never learns its own
 * `teamPlayerId` on this screen otherwise).
 *
 * Deliberately absent: a jersey number (the mockup shows one, but a stable
 * per-player jersey number doesn't exist — clubs share jersey sets between
 * teams, see `CLAUDE.md`'s Teams module and `player-journey.md` §7 item 4/§6.5's
 * note — so the card is cut down to what the roster actually knows: name and
 * role) and MPG/season-high-minutes (no source of playing time exists yet,
 * same rule as the squad table below).
 */
function MyStatsCard({ player }: { player: TeamSeasonPlayerStats }) {
  const emptyReason = emptyRepartitionLabel(player);
  return (
    <Card variant="panel" className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <Avatar size="md">
          <AvatarFallback tone={player.role === 'COACH' ? 'brand' : 'structure'}>
            {getInitials(player.firstName, player.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <Text as="span" variant="display" size="lg">
            {player.firstName} {player.lastName}
          </Text>
          <Text as="span" variant="meta" size="xs">
            {teamMemberRoleLabel(player.role)} · vos statistiques cette saison
          </Text>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          size="sm"
          icon={<CalendarIcon size="md" aria-hidden="true" />}
          label="MJ"
          value={player.gamesPlayed}
        />
        <StatTile
          size="sm"
          icon={<ChartBarsIcon size="md" aria-hidden="true" />}
          label="PTS/M"
          value={formatAverage(player.pointsPerGame)}
        />
        <StatTile
          size="sm"
          icon={<TrophyIcon size="md" aria-hidden="true" />}
          label="Meilleur total"
          value={formatCount(player.seasonHighPoints)}
        />
        <StatTile
          size="sm"
          icon={<ShieldIcon size="md" aria-hidden="true" />}
          label="FA/M"
          value={formatAverage(player.foulsPerGame)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <Text as="span" variant="eyebrow">
            Répartition de vos points
          </Text>
          {emptyReason ? (
            <Text as="span" variant="meta">
              {emptyReason}
            </Text>
          ) : (
            <Text as="span" variant="label" size="sm" className="tabular">
              {player.totalPoints} pts
            </Text>
          )}
        </div>
        <PointsRepartitionBar
          className="h-4"
          label={`Répartition des points de ${player.firstName} ${player.lastName}`}
          threePointPoints={player.threePointPoints}
          twoPointPoints={player.twoPointPoints}
          freeThrowPoints={player.freeThrowPoints}
        />
        {/* The "not an address" sentence is a CLAUDE.md module rule, not a
            style choice — reused verbatim rather than rewritten here. */}
        {!emptyReason && <RepartitionLegend />}
      </div>

      <AwardBadges player={player} />
    </Card>
  );
}

/**
 * A team's season, aggregated from its confirmed scoresheets. Branches
 * error → loading → empty → data, in that order: a failed fetch rendered as an
 * empty state would tell a coach their season doesn't exist when it merely
 * failed to load.
 */
export function TeamSeasonStatsTab({
  clubId,
  teamId,
  season,
  onSeasonChange,
}: {
  clubId: string;
  teamId: string;
  /** Undefined means "whichever season contains today", resolved server-side. */
  season?: number;
  onSeasonChange: (season: number) => void;
}) {
  const { data, isLoading, isError, refetch, isRefetching } = useTeamSeasonStats(
    clubId,
    teamId,
    season,
  );

  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent>
          <SkeletonList rows={4} />
        </CardContent>
      </Card>
    );
  }

  if (data.matchesPlayed === 0) {
    // No selector here on purpose: with nothing analysed there is at most one
    // season to choose from, and a control with one meaningless option reads
    // as broken rather than as empty.
    return (
      <EmptyState
        icon={<ChartBarsIcon size="3xl" tone="structure" />}
        title="Aucun match analysé cette saison"
        description="Les statistiques individuelles se calculent à partir des feuilles de match analysées puis confirmées. Importez la feuille d'un match joué pour voir apparaître les moyennes, les meilleurs totaux et la répartition des points."
        action={
          <Button asChild>
            <Link to={`/clubs/${clubId}/teams/${teamId}?tab=events`}>
              <CalendarIcon size="md" aria-hidden="true" />
              Voir les événements
            </Link>
          </Button>
        }
      />
    );
  }

  // The caller's own roster row, when they have one — absent for a viewer who
  // isn't rostered on this team at all (e.g. a club admin with no Player
  // link), in which case the personal card is simply skipped rather than
  // rendered against a row that doesn't exist. A rostered player who has
  // never played still has a row here (the roster is fetched in full), just
  // with every average at "—" and the bar empty.
  const myStats = data.players.find((player) => player.isMe);

  return (
    <div className="flex flex-col gap-5">
      {myStats && (
        <div className="flex flex-col gap-2.5">
          <SectionHeading>Mes stats</SectionHeading>
          <MyStatsCard player={myStats} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-5">
        <SelectField
          label="Saison"
          containerClassName="w-full sm:w-56"
          value={String(data.seasonYear)}
          onValueChange={(value) => onSeasonChange(Number(value))}
          options={data.availableSeasons.map((year) => ({
            value: String(year),
            label: seasonLabel(year),
          }))}
        />
        <Text as="p" variant="meta" className="flex items-start gap-2 pb-2.5">
          <ChartBarsIcon
            size="md"
            tone="structure"
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
          <span>
            <strong className="font-bold tabular text-charcoal">
              Calculé sur {data.matchesPlayed} match{data.matchesPlayed > 1 ? 's' : ''} analysé
              {data.matchesPlayed > 1 ? 's' : ''}.
            </strong>{' '}
            Les matchs dont la feuille n&apos;a pas été analysée et confirmée ne comptent pas.
          </span>
        </Text>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionHeading>Statistiques individuelles</SectionHeading>
        <RepartitionLegend />
      </div>

      <ResponsiveTable columns={COLUMNS}>
        {data.players.map((player) => (
          <TeamStatsRow key={player.teamPlayerId} player={player} />
        ))}
      </ResponsiveTable>
    </div>
  );
}
