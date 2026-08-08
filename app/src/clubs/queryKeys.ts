export const clubsQueryKey = ['clubs'] as const;
export const clubQueryKey = (clubId: string) => ['clubs', clubId] as const;
export const clubMembersQueryKey = (clubId: string) => ['clubs', clubId, 'members'] as const;
export const clubPlayersQueryKey = (clubId: string) => ['clubs', clubId, 'players'] as const;
