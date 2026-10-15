import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { Check as CheckIcon } from '@basketeasy/ui/icons/check';
import { StatTile } from '@basketeasy/ui/stat-tile';
import { UserIcon } from '@basketeasy/ui/icons/user';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import type {
  AdminEventDetail,
  AdminScoresheetSummary,
} from '@basketeasy/types/platform-admin-browse';
import { ADMIN_OCR_STUCK_AFTER_MS } from '@basketeasy/types/platform-admin-actions';
import type { BadgeProps } from '@basketeasy/ui/badge';
import { teamMemberRoleLabel } from '../clubs/teamLabels';
import { useAdminEvent } from './useAdminQueries';
import { AdminActionDialog } from './actions/AdminActionDialog';
import {
  AdminFacts,
  AdminPageHeader,
  AdminSection,
  AdminStats,
  AdminTable,
  AdminTwoColumn,
} from './shared/AdminLayout';
import { AdminLink, AdminPersonLink, AdminTeamLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import {
  SCORESHEET_STATUS_LABELS,
  SCORESHEET_STATUS_TONES,
  eventTitle,
  formatAdminDateTime,
} from './shared/adminFormat';

type RosterEntry = AdminEventDetail['roster'][number];

const RSVP_LABELS: Record<EventRsvpStatus, string> = {
  GOING: 'Présent·e',
  NOT_GOING: 'Absent·e',
  MAYBE: 'Peut-être',
};

const RSVP_TONES: Record<EventRsvpStatus, NonNullable<BadgeProps['tone']>> = {
  GOING: 'success',
  NOT_GOING: 'danger',
  MAYBE: 'muted',
};

function RosterRow({ entry }: { entry: RosterEntry }) {
  const layout = useTableLayout();
  const answer = entry.rsvp ? (
    <Badge variant="soft" tone={RSVP_TONES[entry.rsvp]}>
      {RSVP_LABELS[entry.rsvp]}
    </Badge>
  ) : (
    <Text as="span" variant="meta" size="sm">
      Sans réponse
    </Text>
  );
  const respondedBy = entry.respondedBy ? (
    <AdminPersonLink person={entry.respondedBy} />
  ) : (
    <Text as="span" variant="meta" size="sm">
      —
    </Text>
  );
  const convoked = entry.convoked ? (
    <Badge variant="soft" tone="brand">
      Convoqué·e
    </Badge>
  ) : null;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <AdminPersonLink person={entry.player} />
          {answer}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="meta" size="sm">
            Répondu par
          </Text>
          {respondedBy}
          {convoked}
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminPersonLink person={entry.player} />
        <Text variant="meta" size="sm">
          {teamMemberRoleLabel(entry.role)}
        </Text>
      </TableCell>
      <TableCell>{answer}</TableCell>
      <TableCell>{respondedBy}</TableCell>
      <TableCell>
        {convoked ?? (
          <Text as="span" variant="meta" size="sm">
            Non
          </Text>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Re-queues the read against the file already stored. Offered only when the
 * server would accept it: never on a confirmed sheet (a manager's reviewed
 * data), and not while a read started under an hour ago may still land.
 */
function ScoresheetRetry({ sheet }: { sheet: AdminScoresheetSummary }) {
  const inFlight = sheet.status === 'QUEUED' || sheet.status === 'PROCESSING';
  const recent = Date.now() - new Date(sheet.uploadedAt).getTime() < ADMIN_OCR_STUCK_AFTER_MS;
  const unavailable = sheet.status === 'CONFIRMED' || (inFlight && recent);

  return (
    <div className="flex flex-col gap-1.5">
      <AdminActionDialog
        trigger={
          <Button variant="outline" disabled={unavailable}>
            Relancer la lecture
          </Button>
        }
        title="Relancer la lecture"
        description="La feuille déjà envoyée repart dans la file de lecture. La personne qui l’a envoyée est prévenue du résultat, comme pour un premier envoi."
        facts={[{ label: 'Statut actuel', value: SCORESHEET_STATUS_LABELS[sheet.status] }]}
        confirmLabel="Relancer"
        path={`scoresheets/${sheet.id}/retry`}
      />
      {unavailable && (
        <Text variant="meta" size="xs">
          Indisponible pendant la lecture, et sur une feuille déjà confirmée.
        </Text>
      )}
    </div>
  );
}

function EventDetail({ event }: { event: AdminEventDetail }) {
  const sheet = event.scoresheet;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={eventTitle(event)}
        eyebrow="Événement"
        parent={{ to: adminPaths.team(event.team.id), label: event.team.name }}
        badges={
          <>
            <Badge variant="soft" tone="structure">
              {event.type === 'MATCH' ? 'Match' : 'Entraînement'}
            </Badge>
            {event.venue && (
              <Badge variant="soft" tone="muted">
                {event.venue === 'HOME' ? 'Domicile' : 'Extérieur'}
              </Badge>
            )}
            <AdminTeamLink team={event.team} />
          </>
        }
        subtitle={`${formatAdminDateTime(event.startsAt)} · ${event.location}`}
        aside={
          <AdminStats>
            <StatTile
              size="sm"
              icon={<CheckIcon size="md" />}
              label="Présents"
              value={event.rsvpCounts.going}
            />
            <StatTile
              size="sm"
              icon={<UserIcon size="md" />}
              label="Absents"
              value={event.rsvpCounts.notGoing}
            />
            <StatTile
              size="sm"
              icon={<UsersIcon size="md" />}
              label="Peut-être"
              value={event.rsvpCounts.maybe}
            />
            <StatTile
              size="sm"
              icon={<CalendarIcon size="md" />}
              label="Convoqués"
              value={event.convocationCount}
            />
          </AdminStats>
        }
      />

      <AdminTwoColumn
        main={
          <AdminSection title="Effectif et réponses" count={event.roster.length}>
            {event.roster.length === 0 ? (
              <Text variant="meta" size="sm">
                L’effectif de l’équipe est vide.
              </Text>
            ) : (
              <AdminTable columns={['Joueur', 'Réponse', 'Répondu par', 'Convocation']}>
                {event.roster.map((entry) => (
                  <RosterRow key={entry.teamPlayerId} entry={entry} />
                ))}
              </AdminTable>
            )}
          </AdminSection>
        }
        aside={
          <>
            {sheet && (
              <Card variant="panel" className="flex flex-col gap-3">
                <SectionHeading as="h2">Feuille de marque</SectionHeading>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="soft" tone={SCORESHEET_STATUS_TONES[sheet.status]}>
                    {SCORESHEET_STATUS_LABELS[sheet.status]}
                  </Badge>
                  {sheet.attemptCount !== null && (
                    <Text as="span" variant="meta" size="sm" className="tabular">
                      {sheet.attemptCount} tentative{sheet.attemptCount > 1 ? 's' : ''}
                    </Text>
                  )}
                </div>
                {sheet.failureReason && (
                  <Text variant="meta" size="sm">
                    « {sheet.failureReason} »
                  </Text>
                )}
                <Text variant="meta" size="sm" className="tabular">
                  Envoyée le {formatAdminDateTime(sheet.uploadedAt)}
                </Text>
                <ScoresheetRetry sheet={sheet} />
                <AdminLink to={adminPaths.scoresheets}>Toutes les feuilles à traiter</AdminLink>
              </Card>
            )}
            <AdminFacts
              facts={[
                {
                  label: 'Série',
                  value: (
                    <Text>{event.recurrenceId ? 'Événement récurrent' : 'Événement unique'}</Text>
                  ),
                },
                { label: 'Notes', value: <Text>{event.notes ?? '—'}</Text> },
              ]}
            />
          </>
        }
      />
    </div>
  );
}

export function AdminEventDetailPage() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const event = useAdminEvent(eventId);

  return (
    <AdminQueryBranch
      query={event}
      errorTitle="Événement indisponible"
      loadingLabel="Chargement de l’événement…"
    >
      {(data) => <EventDetail event={data} />}
    </AdminQueryBranch>
  );
}
