export const clubTeamsQueryKey = (clubId: string) => ['clubs', clubId, 'teams'] as const;
export const teamQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId] as const;
export const teamMembersQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'members'] as const;
