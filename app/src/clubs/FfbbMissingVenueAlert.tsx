import { Link } from 'react-router-dom';
import { Alert } from '@basketeasy/ui/alert';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { FfbbImportResult } from '@basketeasy/types/ffbb';
import { formatEventDateOnly } from './eventDateFormat';

/**
 * After an FFBB import: the upcoming matches still on « Lieu non communiqué »,
 * each linking to its match page where the venue is filled in. Rendered from
 * the import mutation's own result, so the next import or leaving the page is
 * what dismisses it.
 */
export function FfbbMissingVenueAlert({
  clubId,
  teamId,
  result,
}: {
  clubId: string;
  teamId: string;
  result: Pick<FfbbImportResult, 'missingVenue' | 'missingVenueTotal'>;
}) {
  const { missingVenue, missingVenueTotal } = result;
  if (missingVenue.length === 0) return null;

  const remaining = missingVenueTotal - missingVenue.length;
  return (
    <Alert variant="warning" className="flex max-w-md gap-3">
      <WarningIcon size="lg" tone="accent" aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <Text variant="label">
            {missingVenueTotal} {missingVenueTotal > 1 ? 'matchs' : 'match'} sans lieu
          </Text>
          <Text variant="meta">Les joueurs ne savent pas encore où aller.</Text>
        </div>
        <ul className="flex flex-col gap-1">
          {missingVenue.map((match) => (
            <li key={match.eventId}>
              <TextLink asChild>
                <Link to={`/clubs/${clubId}/teams/${teamId}/events/${match.eventId}`}>
                  <span className="tabular">
                    {match.opponentName ? `vs ${match.opponentName}` : 'Match'} ·{' '}
                    {formatEventDateOnly(match.startsAt)}
                  </span>
                </Link>
              </TextLink>
            </li>
          ))}
        </ul>
        {remaining > 0 && (
          <Text variant="meta">
            et {remaining} {remaining > 1 ? 'autres' : 'autre'}
          </Text>
        )}
      </div>
    </Alert>
  );
}
