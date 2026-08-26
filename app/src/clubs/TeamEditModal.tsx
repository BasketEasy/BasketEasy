import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { Team, TeamCategory, Gender } from '@basketeasy/types/teams';
import { useTeamUpdate } from './useTeamUpdate';
import { getClubErrorMessage } from './clubErrorMessages';
import { TEAM_CATEGORY_OPTIONS, TEAM_GENDER_OPTIONS } from './teamLabels';

/**
 * The team's edit form, dialog-ised per the project's modal rule — editing
 * name/category/gender is a focused, self-contained edit of a multi-field
 * record, same reasoning as EventEditModal. Fully controlled by the parent
 * (TeamDetailPage's own "Modifier" button opens it) rather than owning a
 * DialogTrigger, since the header button already exists outside the dialog.
 */
export function TeamEditModal({
  clubId,
  teamId,
  team,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: updateTeam, isPending: isUpdating } = useTeamUpdate(clubId, teamId);
  const [name, setName] = useState(team.name);
  const [category, setCategory] = useState<TeamCategory>(team.category);
  const [gender, setGender] = useState<Gender>(team.gender);
  const [editError, setEditError] = useState<string | null>(null);

  // Re-sync the form's fields every time the dialog opens, so stale values
  // from a previous open never leak into the fields — same pattern as
  // EventEditModal's reset-on-open effect.
  useEffect(() => {
    if (open) {
      setName(team.name);
      setCategory(team.category);
      setGender(team.gender);
      setEditError(null);
    }
  }, [open, team]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;équipe</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {editError && (
            <Alert variant="destructive">
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <FormField
            label="Nom de l'équipe"
            id="team-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <SelectField
            label="Catégorie"
            id="team-edit-category-select"
            options={TEAM_CATEGORY_OPTIONS}
            value={category}
            onValueChange={(value) => setCategory(value as TeamCategory)}
          />

          <SelectField
            label="Genre"
            id="team-edit-gender-select"
            options={TEAM_GENDER_OPTIONS}
            value={gender}
            onValueChange={(value) => setGender(value as Gender)}
          />

          <Button
            loading={isUpdating}
            onClick={() =>
              updateTeam(
                { name, category, gender },
                {
                  onSuccess: () => {
                    toast({ variant: 'success', title: 'Équipe modifiée' });
                    onOpenChange(false);
                  },
                  onError: (err) => setEditError(getClubErrorMessage(err)),
                },
              )
            }
          >
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
