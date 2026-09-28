import { useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import type { AdminEventDetail } from '@basketeasy/types/platform-admin-browse';
import type { BadgeProps } from '@basketeasy/ui/badge';
import { teamMemberRoleLabel } from '../clubs/teamLabels';
import { useAdminEvent } from './useAdminQueries';
import {
  AdminFacts,
  AdminPageHeader,
  AdminSection,
  AdminStat,
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

function EventDetail({ event }: { event: AdminEventDetail }) {
  const sheet = event.scoresheet;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={eventTitle(event)}
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
      />

      <AdminStats>
        <AdminStat label="Présents" value={event.rsvpCounts.going} />
        <AdminStat label="Absents" value={event.rsvpCounts.notGoing} />
        <AdminStat label="Peut-être" value={event.rsvpCounts.maybe} />
        <AdminStat label="Convoqués" value={event.convocationCount} />
      </AdminStats>

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
