import { useSearchParams } from 'react-router-dom';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { Text } from '@basketeasy/ui/text';
import { TEAM_CATEGORY_OPTIONS } from '../../clubs/teamLabels';
import {
  ADMIN_STATS_RANGES,
  type AdminStats,
  type AdminStatsRange,
} from '@basketeasy/types/platform-admin-stats';
import { useAdminStats } from '../useAdminQueries';
import { AdminSection } from '../shared/AdminLayout';
import { AdminLink } from '../shared/AdminLinks';
import { AdminQueryBranch } from '../shared/AdminQueryBranch';
import { adminPaths } from '../shared/adminPaths';
import { SCORESHEET_STATUS_LABELS, formatAdminDateTime } from '../shared/adminFormat';
import { BreakdownBars, StatTile, WeeklyBars } from './StatCharts';
import { formatCount, formatDecimal, formatRatio } from './statFormat';

const RANGE_LABELS: Record<AdminStatsRange, string> = {
  '7d': '7 jours',
  '30d': '30 jours',
  '90d': '90 jours',
  season: 'Saison',
  all: 'Tout',
};
const RANGE_OPTIONS = ADMIN_STATS_RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }));
const DEFAULT_RANGE: AdminStatsRange = '30d';

const count = (value: number | null) => (value === null ? '—' : formatCount(value));
const percent = (value: number | null) => formatRatio(value);

/**
 * Where a tile's number leads: the list that shows the records behind it,
 * already filtered. On a club page, the club's own tab where one exists.
 */
function statLinks(clubId: string | undefined) {
  const withClub = (path: string, params: Record<string, string>) => {
    const query = new URLSearchParams(clubId ? { ...params, clubId } : params);
    return `${path}?${query}`;
  };
  const clubTab = (tab: string, params: Record<string, string> = {}) =>
    `${adminPaths.club(clubId!)}?${new URLSearchParams({ tab, ...params })}`;

  return {
    users: withClub(adminPaths.users, {}),
    unverified: withClub(adminPaths.users, { verified: 'false' }),
    nearingErasure: withClub(adminPaths.users, { inactiveSoon: 'true' }),
    clubs: clubId ? undefined : adminPaths.clubs,
    clubsWithoutAdmin: clubId ? undefined : `${adminPaths.clubs}?hasAdmin=false`,
    teams: clubId ? clubTab('teams') : adminPaths.teams,
    teamsWithoutManager: clubId
      ? clubTab('teams', { 't.hasAdmin': 'false' })
      : `${adminPaths.teams}?hasAdmin=false`,
    players: clubId ? clubTab('players') : adminPaths.players,
    claimedPlayers: clubId
      ? clubTab('players', { 'p.claimed': 'true' })
      : `${adminPaths.players}?claimed=true`,
    minorsMissingConsent: clubId
      ? clubTab('players', { 'p.missingConsent': 'true' })
      : `${adminPaths.players}?missingConsent=true`,
    failedSheets: withClub(adminPaths.scoresheets, { view: 'failed' }),
    reviewSheets: withClub(adminPaths.scoresheets, { view: 'review' }),
    stuckSheets: withClub(adminPaths.scoresheets, { view: 'stuck' }),
    retention: adminPaths.retention,
  };
}

function Growth({ stats, links }: { stats: AdminStats; links: ReturnType<typeof statLinks> }) {
  const { growth } = stats;
  const added = (n: number) => `+${formatCount(n)} sur la période`;
  const share = (n: number) =>
    growth.users.total > 0 ? `${formatRatio(n / growth.users.total)} des comptes` : undefined;

  return (
    <AdminSection title="Croissance">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Utilisateurs"
          value={count(growth.users.total)}
          hint={added(growth.users.added)}
          to={links.users}
        />
        <StatTile
          label="Clubs"
          value={count(growth.clubs.total)}
          hint={added(growth.clubs.added)}
          to={links.clubs}
        />
        <StatTile
          label="Équipes"
          value={count(growth.teams.total)}
          hint={added(growth.teams.added)}
          to={links.teams}
        />
        <StatTile
          label="Joueurs"
          value={count(growth.players.total)}
          hint={added(growth.players.added)}
          to={links.players}
        />
        <StatTile
          label="Actifs sur 7 jours"
          value={count(growth.active7d)}
          hint={share(growth.active7d)}
        />
        <StatTile
          label="Actifs sur 30 jours"
          value={count(growth.active30d)}
          hint={share(growth.active30d)}
        />
        <StatTile
          label="Actifs sur 90 jours"
          value={count(growth.active90d)}
          hint={share(growth.active90d)}
        />
        <StatTile
          label="Joueurs avec un compte"
          value={percent(growth.claimedPlayerShare)}
          to={links.claimedPlayers}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <WeeklyBars
          title="Nouveaux comptes par semaine"
          summary={`${formatCount(growth.users.added)} sur la période`}
          points={growth.newUsers}
          format={count}
        />
        <WeeklyBars
          title="Nouveaux joueurs par semaine"
          summary={`${formatCount(growth.players.added)} sur la période`}
          points={growth.newPlayers}
          format={count}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BreakdownBars
            title="Équipes par catégorie"
            rows={TEAM_CATEGORY_OPTIONS.map((option) => {
              const value = growth.teamsByCategory
                .filter((row) => row.category === option.value)
                .reduce((sum, row) => sum + row.count, 0);
              return { label: option.label, value, display: formatCount(value) };
            })}
          />
        </div>
        <div className="flex flex-col gap-3">
          <StatTile label="Équipes CTC (2 clubs ou plus)" value={count(growth.ctcTeams)} />
          <StatTile
            label="Comptes parent uniquement"
            value={count(growth.guardianOnlyAccounts)}
            hint="Liés à un enfant, sans adhésion"
          />
        </div>
      </div>
    </AdminSection>
  );
}

function Engagement({ stats }: { stats: AdminStats }) {
  const { engagement } = stats;
  const total = (points: { value: number | null }[]) =>
    formatCount(points.reduce((sum, point) => sum + (point.value ?? 0), 0));
  const rsvpTotal =
    engagement.rsvpSplit.going + engagement.rsvpSplit.notGoing + engagement.rsvpSplit.maybe;
  const travelTotal = engagement.travelSplit.meetingPoint + engagement.travelSplit.direct;
  const share = (n: number, of: number) => formatRatio(of > 0 ? n / of : null);

  return (
    <AdminSection title="Engagement">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <WeeklyBars
          title="Matchs par semaine"
          summary={total(engagement.matchesByWeek)}
          points={engagement.matchesByWeek}
          format={count}
        />
        <WeeklyBars
          title="Entraînements par semaine"
          summary={total(engagement.trainingsByWeek)}
          points={engagement.trainingsByWeek}
          format={count}
        />
        <WeeklyBars
          title="Taux de réponse par semaine"
          summary={percent(engagement.rsvpResponseRate)}
          points={engagement.rsvpResponseRateByWeek}
          format={percent}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Taux de réponse"
          value={percent(engagement.rsvpResponseRate)}
          hint="Sur l’effectif actuel"
        />
        <StatTile
          label="Réponses d’un parent"
          value={share(engagement.guardianAnswers, rsvpTotal)}
          hint={`${formatCount(engagement.guardianAnswers)} réponses`}
        />
        <StatTile label="Convocations envoyées" value={total(engagement.convocationsByWeek)} />
        <StatTile
          label="Feuilles envoyées"
          value={percent(engagement.scoresheetCoverage)}
          hint="Des matchs passés"
        />
        <StatTile
          label="Matchs avec un RDV"
          value={percent(engagement.matchesWithMeetingPointShare)}
        />
        <StatTile label="Événements récurrents" value={percent(engagement.recurringShare)} />
        <StatTile label="Votes MVP" value={count(engagement.votesCast)} hint="Anonymes" />
        <StatTile label="Liens parent créés" value={total(engagement.guardianLinksByWeek)} />
        <StatTile
          label="Notifications push"
          value={count(engagement.pushEnabledUsers)}
          hint="Comptes abonnés"
        />
        <StatTile
          label="E-mails désactivés"
          value={percent(engagement.emailOptOutShare)}
          hint="Des comptes"
        />
        <StatTile label="Clubs liés à la FFBB" value={count(engagement.ffbbLinkedClubs)} />
        <StatTile label="Équipes liées à la FFBB" value={count(engagement.ffbbLinkedTeams)} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BreakdownBars
          title="Réponses"
          rows={[
            {
              label: 'Présent·e',
              value: engagement.rsvpSplit.going,
              display: share(engagement.rsvpSplit.going, rsvpTotal),
            },
            {
              label: 'Absent·e',
              value: engagement.rsvpSplit.notGoing,
              display: share(engagement.rsvpSplit.notGoing, rsvpTotal),
            },
            {
              label: 'Peut-être',
              value: engagement.rsvpSplit.maybe,
              display: share(engagement.rsvpSplit.maybe, rsvpTotal),
            },
          ]}
        />
        <BreakdownBars
          title="Trajet des présents"
          rows={[
            {
              label: 'Point de RDV',
              value: engagement.travelSplit.meetingPoint,
              display: share(engagement.travelSplit.meetingPoint, travelTotal),
            },
            {
              label: 'Direct',
              value: engagement.travelSplit.direct,
              display: share(engagement.travelSplit.direct, travelTotal),
            },
          ]}
        />
      </div>
    </AdminSection>
  );
}

function Health({ stats, links }: { stats: AdminStats; links: ReturnType<typeof statLinks> }) {
  const { health } = stats;
  const run = health.lastRetentionRun;

  return (
    <AdminSection title="Santé">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BreakdownBars
          title="Feuilles de marque par statut"
          rows={(
            Object.keys(health.scoresheetsByStatus) as (keyof typeof health.scoresheetsByStatus)[]
          ).map((status) => ({
            label: SCORESHEET_STATUS_LABELS[status],
            value: health.scoresheetsByStatus[status],
            display: formatCount(health.scoresheetsByStatus[status]),
          }))}
          action={<AdminLink to={links.failedSheets}>Voir les échecs</AdminLink>}
        />
        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-3">
          <StatTile
            label="Taux d’échec"
            value={percent(health.ocrFailureRate)}
            to={links.failedSheets}
          />
          <StatTile label="À vérifier" value={count(health.needsReview)} to={links.reviewSheets} />
          <StatTile
            label="Bloquées"
            value={count(health.stuckScoresheets)}
            hint="En file depuis plus d’1 h"
            to={links.stuckSheets}
          />
          <StatTile
            label="Tentatives moyennes"
            value={formatDecimal(health.avgOcrAttempts)}
            hint="Par feuille lue"
          />
          <StatTile
            label="Dernière purge"
            value={run ? (run.ok ? 'OK' : 'Erreur') : '—'}
            hint={run ? formatAdminDateTime(run.ranAt) : 'Aucune purge enregistrée'}
            to={links.retention}
          />
          <StatTile
            label="Trajets à recalculer"
            value={count(health.staleMeetingRoutes)}
            hint="Matchs des 7 prochains jours"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Adresses non vérifiées"
          value={count(health.unverifiedUsers)}
          hint={`Dont ${formatCount(health.unverifiedOlderThan7d)} depuis plus de 7 j`}
          to={links.unverified}
        />
        <StatTile
          label="Mineurs sans autorisation"
          value={count(health.minorsMissingConsent)}
          to={links.minorsMissingConsent}
        />
        <StatTile
          label="Bientôt effacés"
          value={count(health.accountsNearingErasure)}
          hint="Inactifs depuis 11 mois"
          to={links.nearingErasure}
        />
        <StatTile
          label="Clubs sans admin"
          value={count(health.clubsWithoutAdmin)}
          to={links.clubsWithoutAdmin}
        />
        <StatTile
          label="Équipes sans gestionnaire"
          value={count(health.teamsWithoutManager)}
          to={links.teamsWithoutManager}
        />
        <StatTile
          label="Invitations joueur"
          value={count(health.pendingPlayerInvites.live)}
          hint={`En cours · ${formatCount(health.pendingPlayerInvites.expired)} expirées`}
        />
        <StatTile
          label="Invitations parent"
          value={count(health.pendingGuardianInvites.live)}
          hint={`En cours · ${formatCount(health.pendingGuardianInvites.expired)} expirées`}
        />
      </div>
    </AdminSection>
  );
}

/**
 * The dashboard: platform-wide on /admin, or one club's on its page (`clubId`).
 * The range lives in the URL under `prefix`, so a view can be shared and a
 * club tab keeps its own.
 */
export function AdminStatsPanel({ clubId, prefix = '' }: { clubId?: string; prefix?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeKey = `${prefix}range`;
  const rawRange = searchParams.get(rangeKey) as AdminStatsRange | null;
  const range = rawRange && ADMIN_STATS_RANGES.includes(rawRange) ? rawRange : DEFAULT_RANGE;
  const stats = useAdminStats({ range, clubId });
  const links = statLinks(clubId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="meta" size="sm">
          Par semaine, heure de Paris
          {clubId && ' · une équipe partagée entre deux clubs compte dans chacun'}
        </Text>
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            ariaLabel="Période"
            value={range}
            options={RANGE_OPTIONS}
            onChange={(next) =>
              setSearchParams(
                (previous) => {
                  const params = new URLSearchParams(previous);
                  if (next === DEFAULT_RANGE) params.delete(rangeKey);
                  else params.set(rangeKey, next);
                  return params;
                },
                { replace: true },
              )
            }
          />
        </div>
      </div>
      <AdminQueryBranch
        query={stats}
        errorTitle="Statistiques indisponibles"
        loadingLabel="Calcul des statistiques…"
      >
        {(data) => (
          <div className="flex flex-col gap-8">
            <Growth stats={data} links={links} />
            <Engagement stats={data} />
            <Health stats={data} links={links} />
          </div>
        )}
      </AdminQueryBranch>
    </div>
  );
}
