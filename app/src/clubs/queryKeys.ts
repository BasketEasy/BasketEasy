export const clubsQueryKey = ['clubs'] as const;
export const clubQueryKey = (clubId: string) => ['clubs', clubId] as const;
export const clubMembersQueryKey = (clubId: string) => ['clubs', clubId, 'members'] as const;
export const clubPlayersQueryKey = (clubId: string) => ['clubs', clubId, 'players'] as const;
export const clubTeamsQueryKey = (clubId: string) => ['clubs', clubId, 'teams'] as const;
export const teamQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId] as const;
export const teamClubsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'clubs'] as const;
export const teamPlayersQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'players'] as const;
