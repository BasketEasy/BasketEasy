import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import type { MeetingPoint } from '@basketeasy/types/meeting-points';
import { MapPinIcon } from '../clubs/eventDetailIcons';

export interface MeetingPointSettingsSummary {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
  /** Team scope: which of the two values come from the club rather than the team. */
  inheritsPlace?: boolean;
  inheritsBuffer?: boolean;
}

const CAPTION = {
  club: 'S’applique à toutes les équipes du club, sauf celles qui ont leur propre RDV.',
  team: 'Vaut pour tous les matchs de l’équipe. Un match précis se règle depuis sa page (« Ajuster le RDV »).',
} as const;

/** Where a team's value comes from — only drawn in team scope. */
function SourceBadge({ inherited }: { inherited: boolean }) {
  return inherited ? (
    <Badge variant="soft" tone="structure">
      du club
    </Badge>
  ) : (
    <Badge variant="soft" tone="brand">
      propre à l’équipe
    </Badge>
  );
}

/**
 * The summary of a club's or a team's meeting-point settings, with the
 * button that opens the edit dialog. Presentational: the query and the
 * mutation belong to ClubMeetingPointSettings / TeamMeetingPointSettings, so
 * the error → loading → data ladder is handed in rather than re-derived here.
 * No meeting point is valid data, not an empty list — it draws a placeholder
 * card that says what happens without one.
 */
export function MeetingPointSettingsCard({
  scope,
  isError,
  isLoading,
  onRetry,
  summary,
  onEdit,
}: {
  scope: 'club' | 'team';
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  summary: MeetingPointSettingsSummary | undefined;
  onEdit: () => void;
}) {
  if (isError) {
    return (
      <QueryError
        title="Point de rendez-vous indisponible"
        description="Les réglages du rendez-vous d’avant-match n’ont pas pu être chargés."
        onRetry={onRetry}
      />
    );
  }
  if (isLoading || !summary) {
    return <Skeleton className="h-20 w-full" />;
  }

  const { meetingPoint, arrivalBufferMinutes, inheritsPlace, inheritsBuffer } = summary;
  const showSources = scope === 'team';

  if (!meetingPoint) {
    return (
      <Card variant="placeholder" className="flex flex-wrap items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text variant="label" className="font-bold">
            Aucun point de rendez-vous
          </Text>
          <Text variant="meta">
            Les joueurs vont directement à la salle, {arrivalBufferMinutes} min avant le match.
          </Text>
        </div>
        <Button onClick={onEdit}>Définir</Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card variant="inset" className="flex flex-wrap items-center gap-3.5">
        <Text
          as="span"
          variant="body"
          tone="structure"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-green-tint"
        >
          <MapPinIcon size={19} />
        </Text>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="span" variant="label" className="break-words font-bold">
              {meetingPoint.name}
            </Text>
            {showSources && <SourceBadge inherited={Boolean(inheritsPlace)} />}
          </div>
          <Text variant="meta" className="break-words">
            {meetingPoint.address}
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            <Text as="span" variant="meta">
              Arrivée à la salle {arrivalBufferMinutes} min avant le match
            </Text>
            {showSources && <SourceBadge inherited={Boolean(inheritsBuffer)} />}
          </div>
        </div>
        <Button variant="outline" onClick={onEdit}>
          Modifier
        </Button>
      </Card>
      <Text variant="meta">{CAPTION[scope]}</Text>
    </div>
  );
}
