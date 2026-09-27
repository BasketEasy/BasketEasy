import { useMemo, useState } from 'react';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { toast } from '@basketeasy/ui/toast-store';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  MeetingPointSettingsCard,
  type MeetingPointSettingsSummary,
} from './MeetingPointSettingsCard';
import { MeetingPointSettingsDialog } from './MeetingPointSettingsDialog';
import { useTeamMeetingSettings } from './useTeamMeetingSettings';
import { useTeamMeetingSettingsUpdate } from './useTeamMeetingSettingsUpdate';

/**
 * A team manager's view of the meeting point: what applies to this team's
 * matches (its own override, or the owner club's default, marked « (club) »),
 * and the dialog to override either value for every match of the team.
 */
export function TeamMeetingPointSettings({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, isLoading, refetch } = useTeamMeetingSettings(clubId, teamId);
  const { mutate: save, isPending } = useTeamMeetingSettingsUpdate(clubId, teamId);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo<MeetingPointSettingsSummary | undefined>(
    () =>
      data && {
        meetingPoint: data.meetingPoint ?? data.clubDefaults.meetingPoint,
        arrivalBufferMinutes: data.arrivalBufferMinutes ?? data.clubDefaults.arrivalBufferMinutes,
        inheritsPlace: data.meetingPoint === null,
        inheritsBuffer: data.arrivalBufferMinutes === null,
      },
    [data],
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h2">Rendez-vous d’avant-match</SectionHeading>
      <MeetingPointSettingsCard
        isError={isError}
        isLoading={isLoading}
        onRetry={() => refetch()}
        summary={summary}
        onEdit={() => {
          setError(null);
          setIsOpen(true);
        }}
      />
      {data && (
        <MeetingPointSettingsDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          title="Point de rendez-vous de l’équipe"
          value={data}
          inherited={data.clubDefaults}
          isSaving={isPending}
          error={error}
          onSubmit={(value) =>
            save(value, {
              onSuccess: () => {
                toast({ variant: 'success', title: 'Point de rendez-vous enregistré' });
                setIsOpen(false);
              },
              onError: (err) => setError(getClubErrorMessage(err)),
            })
          }
        />
      )}
    </section>
  );
}
