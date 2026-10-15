import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AdminStatPoint, AdminStats } from '@basketeasy/types/platform-admin-stats';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../testUtils';
import { AdminStatsPanel } from './AdminStatsPanel';
import { formatRatio, formatWeek } from './statFormat';

const WEEKS: AdminStatPoint[] = [
  { weekStart: '2026-09-14', value: 3 },
  { weekStart: '2026-09-21', value: 5 },
  { weekStart: '2026-09-28', value: 1 },
];

function stats(overrides: Partial<AdminStats['health']> = {}): AdminStats {
  const count = { total: 0, added: 0 };
  return {
    range: '30d',
    from: '2026-08-29T12:00:00.000Z',
    to: '2026-09-28T12:00:00.000Z',
    clubId: null,
    growth: {
      users: { total: 1284, added: 46 },
      clubs: count,
      teams: count,
      players: count,
      claimedPlayerShare: null,
      active7d: 0,
      active30d: 0,
      active90d: 0,
      guardianOnlyAccounts: 0,
      ctcTeams: 0,
      newUsers: WEEKS,
      newClubs: WEEKS,
      newTeams: WEEKS,
      newPlayers: WEEKS,
      teamsByCategory: [],
    },
    engagement: {
      matchesByWeek: WEEKS,
      trainingsByWeek: WEEKS,
      recurringShare: null,
      rsvpResponseRate: 0.71,
      rsvpResponseRateByWeek: WEEKS.map((week) => ({ ...week, value: null })),
      rsvpSplit: { going: 0, notGoing: 0, maybe: 0 },
      guardianAnswers: 0,
      convocationsByWeek: WEEKS,
      matchesWithMeetingPointShare: null,
      travelSplit: { meetingPoint: 0, direct: 0 },
      votesCast: 0,
      scoresheetCoverage: null,
      guardianLinksByWeek: WEEKS,
      emailOptOutShare: null,
      pushEnabledUsers: 0,
      ffbbLinkedClubs: 0,
      ffbbLinkedTeams: 0,
    },
    sharing: {
      guestLinks: { teamsEnabled: 0, answersViaLink: 0, answersViaLinkShare: null },
      whatsapp: { teamsEnabled: 0, sent: 0, pending: 0, scheduled: 0, expired: 0, overdue: 0 },
    },
    health: {
      scoresheetsByStatus: {
        UPLOADED: 0,
        QUEUED: 0,
        PROCESSING: 0,
        PARSED: 0,
        NEEDS_REVIEW: 0,
        CONFIRMED: 0,
        FAILED: 0,
      },
      ocrFailureRate: null,
      avgOcrAttempts: null,
      needsReview: 0,
      stuckScoresheets: 0,
      unverifiedUsers: 0,
      unverifiedOlderThan7d: 0,
      pendingPlayerInvites: { live: 0, expired: 0 },
      pendingGuardianInvites: { live: 0, expired: 0 },
      minorsMissingConsent: 23,
      accountsNearingErasure: 0,
      clubsWithoutAdmin: 0,
      teamsWithoutManager: 0,
      lastRetentionRun: null,
      staleMeetingRoutes: 0,
      ...overrides,
    },
  };
}

function serve(body: AdminStats): URLSearchParams[] {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/admin/stats', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(body);
    }),
  );
  return requests;
}

describe('AdminStatsPanel', () => {
  it('shows the figures, and « — » rather than 0 % for a ratio with nothing to divide by', async () => {
    serve(stats());

    renderWithProviders(<AdminStatsPanel />, { route: '/admin' });

    expect(await screen.findByText('1 284')).toBeInTheDocument();
    expect(screen.getByText('+46 sur la période')).toBeInTheDocument();
    // Scoresheet coverage has no past match to divide by.
    const coverage = screen.getByText('Feuilles envoyées').parentElement!.parentElement!;
    expect(within(coverage).getByText('—')).toBeInTheDocument();
  });

  it('asks for the chosen range', async () => {
    const requests = serve(stats());
    const user = userEvent.setup();

    renderWithProviders(<AdminStatsPanel />, { route: '/admin' });
    await screen.findByText('1 284');
    await user.click(
      within(screen.getByRole('group', { name: 'Période' })).getByRole('button', {
        name: 'Saison',
      }),
    );

    await screen.findByText('1 284');
    expect(requests[0].get('range')).toBe('30d');
    expect(requests[requests.length - 1].get('range')).toBe('season');
  });

  it('links a health tile to the records behind it, inside the club when scoped', async () => {
    const requests = serve(stats());

    renderWithProviders(<AdminStatsPanel clubId="club-1" prefix="s." />, {
      route: '/admin/clubs/club-1?tab=stats',
    });

    expect(
      await screen.findByRole('link', { name: 'Mineurs sans autorisation : 23, voir le détail' }),
    ).toHaveAttribute('href', '/admin/clubs/club-1?tab=players&p.missingConsent=true');
    expect(requests[0].get('clubId')).toBe('club-1');
  });

  it('shows the team-sharing figures, « — » for a link with no answers', async () => {
    const base = stats();
    serve({
      ...base,
      sharing: {
        guestLinks: { teamsEnabled: 12, answersViaLink: 0, answersViaLinkShare: null },
        whatsapp: { teamsEnabled: 7, sent: 31, pending: 4, scheduled: 9, expired: 2, overdue: 1 },
      },
    });

    renderWithProviders(<AdminStatsPanel />, { route: '/admin' });

    const sharing = (await screen.findByText('Partage d’équipe')).closest('section')!;
    const tile = (label: string) => within(sharing).getByText(label).parentElement!.parentElement!;
    expect(within(tile('Réponses via le lien')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Partages envoyés')).getByText('31')).toBeInTheDocument();
    expect(within(tile('Envois en retard')).getByText('1')).toBeInTheDocument();
  });

  it('carries every chart as a table for assistive tech', async () => {
    serve(stats());

    renderWithProviders(<AdminStatsPanel />, { route: '/admin' });

    const table = await screen.findByRole('table', { name: 'Nouveaux comptes par semaine' });
    expect(within(table).getAllByRole('row')).toHaveLength(WEEKS.length + 1);
  });
});

describe('stat formatting', () => {
  it('formats ratios and weeks the French way', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(0.714)).toBe('71 %');
    expect(formatWeek('2026-09-28')).toBe('28 sept.');
  });
});
