import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { RefreshIcon } from '@basketeasy/ui/icons/refresh';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { ApiError } from '../api/client';
import { usePouleResults } from './usePouleResults';
import { PouleStandingRow } from './PouleStandingRow';

const STANDINGS_COLUMNS = ['#', 'Équipe', 'J', 'G', 'P', 'Pts'] as const;

/**
 * A team's whole poule — federation data read live from FFBB, never
 * something this app owns, which is why it's a panel on the Agenda tab
 * rather than a tab of its own (see
 * docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md).
 *
 * Branches error → loading → empty → data, per CLAUDE.md's query-branch
 * rule. "Empty" here specifically means "no FFBB competition linked yet" (a
 * 404 with no error code); any other failure — including the "linked but
 * FFBB couldn't be reached right now" case, which also 404s but carries
 * FFBB_POULE_UNAVAILABLE — renders as the error branch instead, since it
 * isn't the same situation as never having linked anything.
 */
export function PouleResultsPanel({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, error, isError, isLoading, isRefetching, refetch } = usePouleResults(
    clubId,
    teamId,
  );

  const isNoLinkYet = error instanceof ApiError && error.status === 404 && !error.code;

  if (isError && !isNoLinkYet) {
    return (
      <Card>
        <CardContent>
          <QueryError
            title="Résultats de la poule indisponibles"
            description="Impossible de récupérer les résultats de la poule pour le moment. Réessayez dans quelques minutes."
            onRetry={() => refetch()}
            isRetrying={isRefetching}
          />
        </CardContent>
      </Card>
    );
  }

  if (isNoLinkYet) {
    return (
      <EmptyState
        icon={<UsersIcon tone="structure" className="h-8 w-8" />}
        title="Aucune compétition FFBB liée"
        description="Liez cette équipe à sa compétition sur competitions.ffbb.com (ci-dessus) pour voir les résultats et le classement de sa poule."
      />
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent>
          <SkeletonList rows={3} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <SectionHeading>Résultats de la poule</SectionHeading>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshIcon aria-hidden="true" className="h-4 w-4" />
          Rafraîchir
        </Button>
      </div>
      {data.competitionLabel && (
        <Text as="p" variant="meta">
          {data.competitionLabel}
        </Text>
      )}

      <div className="flex flex-col gap-2.5">
        <Text as="span" variant="eyebrow">
          Résultats
        </Text>
        {data.matchdays.length === 0 ? (
          <Text as="p" variant="meta">
            Aucun résultat pour le moment.
          </Text>
        ) : (
          <div className="flex flex-col gap-4">
            {data.matchdays.map((matchday) => (
              <div key={matchday.matchdayLabel} className="flex flex-col gap-2">
                <Text as="span" variant="meta">
                  {matchday.matchdayLabel}
                </Text>
                <div className="flex flex-col gap-1.5">
                  {matchday.results.map((result, index) => (
                    <div
                      key={`${result.homeLabel}-${result.awayLabel}-${index}`}
                      className={
                        result.involvesOurTeam
                          ? 'flex items-center justify-between gap-3 rounded-md border border-orange/40 bg-orange-tint px-3 py-2'
                          : 'flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2'
                      }
                    >
                      <Text
                        as="span"
                        variant="label"
                        size="sm"
                        tone={result.involvesOurTeam ? 'brand' : undefined}
                        className="min-w-0 flex-1 truncate"
                      >
                        {result.homeLabel}
                      </Text>
                      <Text
                        as="span"
                        variant="display"
                        size="sm"
                        tone={result.involvesOurTeam ? 'brand' : undefined}
                        className="tabular shrink-0"
                      >
                        {result.homeScore} – {result.awayScore}
                      </Text>
                      <Text
                        as="span"
                        variant="label"
                        size="sm"
                        tone={result.involvesOurTeam ? 'brand' : undefined}
                        className="min-w-0 flex-1 truncate text-right"
                      >
                        {result.awayLabel}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Text as="span" variant="eyebrow">
          Classement
        </Text>
        {data.standings.length === 0 ? (
          <Text as="p" variant="meta">
            Le classement n&apos;est pas encore disponible.
          </Text>
        ) : (
          <ResponsiveTable columns={STANDINGS_COLUMNS}>
            {data.standings.map((standing, index) => (
              <PouleStandingRow
                key={`${standing.teamLabel}-${index}`}
                rank={index + 1}
                standing={standing}
              />
            ))}
          </ResponsiveTable>
        )}
      </div>
    </div>
  );
}
