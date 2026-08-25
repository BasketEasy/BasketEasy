import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { toast } from '@basketeasy/ui/toast-store';
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
  const { mutate: deleteTeam, isPending } = useTeamDelete(clubId);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="destructive">Supprimer</Button>}
      title="Supprimer l’équipe ?"
      description={`« ${teamName} » sera supprimée définitivement, avec son effectif (${playerCount}) et tous ses événements (${eventCount}). Cette action est irréversible.`}
      confirmLabel="Supprimer définitivement"
      confirmWord={teamName}
      isPending={isPending}
      onConfirm={() =>
        deleteTeam(teamId, {
          onSuccess: () => {
            toast({ variant: 'success', title: 'Équipe supprimée' });
            navigate(`/clubs/${clubId}/members?tab=teams`);
          },
          onError: (err) =>
            toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
        })
      }
    />
  );
}
