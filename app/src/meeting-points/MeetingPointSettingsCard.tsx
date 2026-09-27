import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import type { MeetingPoint } from '@basketeasy/types/meeting-points';
import { MapPinIcon } from '../clubs/eventDetailIcons';
import { formatArrivalBuffer, formatMeetingPoint } from './meetingPointLabels';

export interface MeetingPointSettingsSummary {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
  /** Team scope: which of the two values come from the club rather than the team. */
  inheritsPlace?: boolean;
  inheritsBuffer?: boolean;
}

const INHERITED_SUFFIX = ' (club)';

/**
 * The one-line summary of a club's or a team's meeting-point settings, with
 * the button that opens the edit dialog. Presentational: the query and the
 * mutation belong to ClubMeetingPointSettings / TeamMeetingPointSettings, so
 * the error → loading → data ladder is handed in rather than re-derived here.
 */
export function MeetingPointSettingsCard({
  isError,
  isLoading,
  onRetry,
  summary,
  onEdit,
}: {
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
    return <Skeleton className="h-16 w-full" />;
  }

  const { meetingPoint, arrivalBufferMinutes, inheritsPlace, inheritsBuffer } = summary;
  return (
    <Card variant="inset" className="flex flex-wrap items-center gap-3.5">
      <Text
        as="span"
        variant="body"
        tone="structure"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-green-tint"
      >
        <MapPinIcon size={19} />
      </Text>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <Text as="span" variant="label" size="sm" className="break-words font-bold">
          {meetingPoint
            ? `${formatMeetingPoint(meetingPoint)}${inheritsPlace ? INHERITED_SUFFIX : ''}`
            : 'Aucun point de rendez-vous'}
        </Text>
        <Text as="span" variant="meta" size="xs">
          {formatArrivalBuffer(arrivalBufferMinutes)}
          {inheritsBuffer ? INHERITED_SUFFIX : ''}
        </Text>
      </div>
      <Button size="sm" variant="outline" onClick={onEdit}>
        {meetingPoint ? 'Modifier' : 'Définir'}
      </Button>
    </Card>
  );
}
