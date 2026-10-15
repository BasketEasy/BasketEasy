export const pendingCancellationsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'whatsapp-pending-cancellations'] as const;
