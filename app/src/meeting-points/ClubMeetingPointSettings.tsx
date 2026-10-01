import { DEFAULT_ARRIVAL_BUFFER_MINUTES } from '@basketeasy/types/meeting-points';
import { MeetingPointSettingsCard } from './MeetingPointSettingsCard';
import { MeetingPointSettingsDialog } from './MeetingPointSettingsDialog';
import { useClubMeetingSettings } from './useClubMeetingSettings';
import { useClubMeetingSettingsUpdate } from './useClubMeetingSettingsUpdate';
import { useMeetingSettingsEditor } from './useMeetingSettingsEditor';

/**
 * The club admin's default meeting point and arrival buffer, inherited by
 * every team the club owns. No heading of its own: it is the content of the
 * club page's « RDV par défaut » accordion item.
 */
export function ClubMeetingPointSettings({ clubId }: { clubId: string }) {
  const { data, isError, isLoading, refetch } = useClubMeetingSettings(clubId);
  const { mutateAsync: save } = useClubMeetingSettingsUpdate(clubId);
  const editor = useMeetingSettingsEditor(save);

  return (
    <>
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
    </>
  );
}
