import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import type { GuestRosterMember } from '@basketeasy/types/guest-links';
import { teamMemberRoleLabel } from '../clubs/teamLabels';
import { guestMemberName } from './guestMemberName';

/**
 * Step 1: who is answering. Two players sharing a first name and initial are
 * both listed as they are; the coach can rename one on the roster.
 */
export function GuestRosterPicker({
  roster,
  onChoose,
}: {
  roster: GuestRosterMember[];
  onChoose: (teamPlayerId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Text variant="label" id="guest-picker-label">
        Qui êtes-vous&nbsp;?
      </Text>
      <RadioCardGroup<string>
        aria-labelledby="guest-picker-label"
        className="gap-2"
        value={null}
        onChange={onChoose}
        options={roster.map((member) => ({
          value: member.teamPlayerId,
          render: () => (
            <>
              <Text as="span" variant="label" className="flex-1">
                {guestMemberName(member)}
              </Text>
              {member.role === 'COACH' && (
                <Text as="span" variant="meta" size="xs">
                  {teamMemberRoleLabel(member.role)}
                </Text>
              )}
            </>
          ),
        }))}
      />
    </div>
  );
}
