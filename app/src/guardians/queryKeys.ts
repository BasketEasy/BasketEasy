export const personasQueryKey = ['me', 'personas'] as const;
export const myChildQueryKey = (playerId: string) => ['me', 'children', playerId] as const;
export const myPlayerGuardiansQueryKey = (playerId: string) =>
  ['me', 'players', playerId, 'guardians'] as const;
export const guardianInvitePreviewQueryKey = (token: string) =>
  ['guardian-invites', token] as const;
