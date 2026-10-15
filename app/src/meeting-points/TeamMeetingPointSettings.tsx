import { useMemo } from 'react';
import {
  MeetingPointSettingsCard,
  type MeetingPointSettingsSummary,
} from './MeetingPointSettingsCard';
import { MeetingPointSettingsDialog } from './MeetingPointSettingsDialog';
import { useTeamMeetingSettings } from './useTeamMeetingSettings';
import { useTeamMeetingSettingsUpdate } from './useTeamMeetingSettingsUpdate';
import { useMeetingSettingsEditor } from './useMeetingSettingsEditor';

/**
 * A team manager's view of the meeting point: what applies to this team's
 * matches (its own override, or the owner club's default, marked « (club) »),
 * and the dialog to override either value for every match of the team. No
 * heading of its own: it is the content of the team page's « RDV » accordion
 * item.
 */
export function TeamMeetingPointSettings({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, isLoading, refetch } = useTeamMeetingSettings(clubId, teamId);
  const { mutateAsync: save } = useTeamMeetingSettingsUpdate(clubId, teamId);
  const editor = useMeetingSettingsEditor(save);

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
    <>
      <MeetingPointSettingsCard
        scope="team"
        isError={isError}
        isLoading={isLoading}
        onRetry={() => refetch()}
        summary={summary}
        onEdit={editor.open}
      />
      {data && (
        <MeetingPointSettingsDialog
          open={editor.isOpen}
          onOpenChange={editor.setIsOpen}
          title="Point de rendez-vous de l’équipe"
          value={data}
          inherited={data.clubDefaults}
          onSubmit={editor.submit}
        />
      )}
    </>
  );
}
