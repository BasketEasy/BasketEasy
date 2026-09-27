import { SectionHeading } from '@basketeasy/ui/section-heading';
import { DEFAULT_ARRIVAL_BUFFER_MINUTES } from '@basketeasy/types/meeting-points';
import { MeetingPointSettingsCard } from './MeetingPointSettingsCard';
import { MeetingPointSettingsDialog } from './MeetingPointSettingsDialog';
import { useClubMeetingSettings } from './useClubMeetingSettings';
import { useClubMeetingSettingsUpdate } from './useClubMeetingSettingsUpdate';
import { useMeetingSettingsEditor } from './useMeetingSettingsEditor';

/** The club admin's default meeting point and arrival buffer, inherited by every team the club owns. */
export function ClubMeetingPointSettings({ clubId }: { clubId: string }) {
  const { data, isError, isLoading, refetch } = useClubMeetingSettings(clubId);
  const { mutateAsync: save } = useClubMeetingSettingsUpdate(clubId);
  const editor = useMeetingSettingsEditor(save);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h2">Rendez-vous d’avant-match</SectionHeading>
      <MeetingPointSettingsCard
        scope="club"
        isError={isError}
        isLoading={isLoading}
        onRetry={() => refetch()}
        summary={data}
        onEdit={editor.open}
      />
      {data && (
        <MeetingPointSettingsDialog
          open={editor.isOpen}
          onOpenChange={editor.setIsOpen}
          title="Point de rendez-vous du club"
          value={data}
          onSubmit={(value) =>
            editor.submit({
              meetingPoint: value.meetingPoint,
              arrivalBufferMinutes: value.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES,
            })
          }
        />
      )}
    </section>
  );
}
