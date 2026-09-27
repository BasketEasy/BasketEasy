import { useState } from 'react';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { toast } from '@basketeasy/ui/toast-store';
import { DEFAULT_ARRIVAL_BUFFER_MINUTES } from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { MeetingPointSettingsCard } from './MeetingPointSettingsCard';
import { MeetingPointSettingsDialog } from './MeetingPointSettingsDialog';
import { useClubMeetingSettings } from './useClubMeetingSettings';
import { useClubMeetingSettingsUpdate } from './useClubMeetingSettingsUpdate';

/** The club admin's default meeting point and arrival buffer, inherited by every team the club owns. */
export function ClubMeetingPointSettings({ clubId }: { clubId: string }) {
  const { data, isError, isLoading, refetch } = useClubMeetingSettings(clubId);
  const { mutate: save, isPending } = useClubMeetingSettingsUpdate(clubId);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h2">Rendez-vous d’avant-match</SectionHeading>
      <MeetingPointSettingsCard
        isError={isError}
        isLoading={isLoading}
        onRetry={() => refetch()}
        summary={data}
        onEdit={() => {
          setError(null);
          setIsOpen(true);
        }}
      />
      {data && (
        <MeetingPointSettingsDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          title="Point de rendez-vous du club"
          value={data}
          isSaving={isPending}
          error={error}
          onSubmit={(value) =>
            save(
              {
                meetingPoint: value.meetingPoint,
                arrivalBufferMinutes: value.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES,
              },
              {
                onSuccess: () => {
                  toast({ variant: 'success', title: 'Point de rendez-vous enregistré' });
                  setIsOpen(false);
                },
                onError: (err) => setError(getClubErrorMessage(err)),
              },
            )
          }
        />
      )}
    </section>
  );
}
