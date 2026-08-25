import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { useTeamDelete } from './useTeamDelete';
import { getClubErrorMessage } from './clubErrorMessages';

export function TeamDeleteModal({
  clubId,
  teamId,
  teamName,
  playerCount = 0,
  eventCount = 0,
}: {
  clubId: string;
  teamId: string;
  teamName: string;
  playerCount?: number;
  eventCount?: number;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate: deleteTeam, isPending } = useTeamDelete(clubId);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Reset any error from a previous open so it never leaks into the
      // next confirmation attempt.
      setError(null);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button variant="destructive">Supprimer</Button>}
      title="Supprimer l’équipe ?"
      description={`« ${teamName} » sera supprimée définitivement, avec son effectif (${playerCount}) et tous ses événements (${eventCount}). Cette action est irréversible.`}
      confirmLabel="Supprimer définitivement"
      confirmWord={teamName}
      isPending={isPending}
      error={error}
      onConfirm={() =>
        deleteTeam(teamId, {
          onSuccess: () => navigate(`/clubs/${clubId}/members?tab=teams`),
          onError: (err) => setError(getClubErrorMessage(err)),
        })
      }
    />
  );
}
