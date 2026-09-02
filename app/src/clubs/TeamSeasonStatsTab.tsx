import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SelectField } from '@basketeasy/ui/select-field';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { useTeamSeasonStats } from './useTeamSeasonStats';
import { TeamStatsRow } from './TeamStatsRow';

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
        icon={<ChartBarsIcon tone="structure" className="h-8 w-8" />}
        title="Aucun match analysé cette saison"
        description="Les statistiques individuelles se calculent à partir des feuilles de match analysées puis confirmées. Importez la feuille d'un match joué pour voir apparaître les moyennes, les meilleurs totaux et la répartition des points."
        action={
          <Button asChild>
            <Link to={`/clubs/${clubId}/teams/${teamId}?tab=events`}>
              <CalendarIcon aria-hidden="true" className="h-4 w-4" />
              Voir les événements
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
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
          <ChartBarsIcon tone="structure" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
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
