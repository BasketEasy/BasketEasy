import type { MyAgendaVoteWinner } from '@basketeasy/types/my-dashboard';

/**
 * « Karim D. », « Vous ! », or several names on a tie. The respondent rule
 * (first name + last initial), never a full name.
 */
export function formatMvpNames(winners: MyAgendaVoteWinner[]): string {
  return winners
    .map((winner) => (winner.isMe ? 'Vous !' : `${winner.firstName} ${winner.lastInitial}.`))
    .join(' · ');
}
