import { useMemo } from 'react';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { PageHeader } from '@basketeasy/ui/page-header';
import { PageContainer } from '@basketeasy/ui/page-container';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { FRESHNESS } from '../api/freshness';
import { PastMatchesSection } from '../clubs/PastMatchesSection';
import { pastMatchesWindowParams } from '../clubs/myAgendaWindow';
import { useMyAgenda } from '../clubs/useMyAgenda';

/**
 * `/results` — the bottom nav's third slot, real since phase 8. Reads the
 * same `pastMatchesWindowParams()`-windowed `GET /me/dashboard` and renders
 * the very `PastMatchesSection` both homes preview — this is the full-page
 * destination for that same list, not a second implementation of it.
 *
 * Unlike the home previews, "no recent match" is worth an explicit empty
 * state here: this page's entire purpose is the list, so a blank page would
 * read as broken rather than as "nothing happened lately".
 */
export function ResultsPage() {
  // Computed once per mount, not inline (same reasoning as
  // PlayerHome/ManagerHome): the window is snapped to a quarter hour, so it shares
  // its cache entry with them.
  const pastWindow = useMemo(() => pastMatchesWindowParams(), []);
  const { data, isLoading, isError, refetch, isRefetching } = useMyAgenda(pastWindow, {
    freshness: FRESHNESS.slow,
  });
  const pastMatches = (data?.upcomingEvents ?? []).filter((event) => event.type === 'MATCH');

  return (
    <PageContainer size="lg">
      <PageHeader title="Résultats" meta="30 derniers jours" />
      <PastMatchesSection
        headingless
        matches={pastMatches}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isRefetching={isRefetching}
        emptyState={
          <EmptyState
            icon={<TrophyIcon size="3xl" tone="secondary" />}
            title="Aucun résultat récent"
            description="Aucun match joué au cours des 30 derniers jours pour vos équipes."
          />
        }
      />
    </PageContainer>
  );
}
