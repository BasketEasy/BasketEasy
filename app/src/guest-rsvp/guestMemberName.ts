import type { GuestRosterMember } from '@basketeasy/types/guest-links';

export function guestMemberName(member: Pick<GuestRosterMember, 'firstName' | 'lastInitial'>) {
  return member.lastInitial ? `${member.firstName} ${member.lastInitial}.` : member.firstName;
}
