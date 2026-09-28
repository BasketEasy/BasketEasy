import { useMemo } from 'react';
import { SectionHeading } from '@basketeasy/ui/section-heading';
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
 * and the dialog to override either value for every match of the team.
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
    <section className="flex flex-col gap-3">
      <SectionHeading as="h2">Rendez-vous d’avant-match</SectionHeading>
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
    </section>
  );
}
