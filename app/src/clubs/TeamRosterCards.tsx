import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import type { Gender, TeamMemberRole, TeamPlayer } from '@basketeasy/types/teams';
import { getInitials } from './getInitials';
import { teamMemberRoleLabel } from './teamLabels';
import { Text } from '@basketeasy/ui/text';

// TeamPlayer carries no per-player gender — only Team.gender exists. A
// literal "Joueuses" label doesn't generalize to a mixed-gender roster, so
// the wording is picked from the team's own gender: "Joueuses" for a WOMEN
// team, "Joueurs" otherwise (MEN or any future value). Roster grouping only
// has two buckets today (TeamMemberRole: PLAYER/COACH) — don't hardcode
// more structure into this component than that two-value enum needs.
const GROUP_LABEL: Record<TeamMemberRole, (teamGender: Gender) => string> = {
  PLAYER: (teamGender) => (teamGender === 'WOMEN' ? 'Joueuses' : 'Joueurs'),
  COACH: () => 'Staff',
};

function RosterGroup({
  role,
  teamGender,
  players,
}: {
  role: TeamMemberRole;
  teamGender: Gender;
  players: TeamPlayer[];
}) {
  if (players.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading count={players.length}>{GROUP_LABEL[role](teamGender)}</SectionHeading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((player) => (
          <Card key={player.id} variant="inset" className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{getInitials(player.firstName, player.lastName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1">
              <Text as="span" variant="label" className="font-medium">
                {player.firstName} {player.lastName}
              </Text>
              <Badge tone="structure" className="w-fit">
                {teamMemberRoleLabel(player.role)}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * Grouped, avatar-chip roster view — the Effectif tab's default. Reads the
 * full unfiltered roster (see TeamDetailPage's allTeamPlayers) rather than
 * one paginated table page, capped at 100 players/coaches combined — see the
 * TODO at that fetch's call site in TeamDetailPage.tsx for the known
 * multi-club-roster edge case this doesn't yet handle.
 */
export function TeamRosterCards({
  players,
  teamGender,
}: {
  players: TeamPlayer[];
  teamGender: Gender;
}) {
  const playerRows = players.filter((p) => p.role === 'PLAYER');
  const coachRows = players.filter((p) => p.role === 'COACH');

  return (
    <div className="flex flex-col gap-6">
      <RosterGroup role="PLAYER" teamGender={teamGender} players={playerRows} />
      <RosterGroup role="COACH" teamGender={teamGender} players={coachRows} />
    </div>
  );
}
