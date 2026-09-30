import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@basketeasy/ui/button';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { Input } from '@basketeasy/ui/input';
import { FieldError } from '@basketeasy/ui/field-error';
import { toast } from '@basketeasy/ui/toast-store';
import type { Club } from '@basketeasy/types/clubs';
import { useClubFfbbLinkSet } from './useClubFfbbLinkSet';
import { useClubFfbbLinkRemove } from './useClubFfbbLinkRemove';
import { getClubErrorMessage } from './clubErrorMessages';

/**
 * The club hero's fact: its FFBB club code. Inline (not a Dialog), same
 * treatment as the team-link disclosure, since the code is a single optional,
 * unvalidated field with no destructive action to guard
 * (docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md).
 *
 * A missing code is a neutral tile, never an accent one: the code drives
 * nothing (`ClubsService.setFfbbLink` stores it unvalidated), so it is not a
 * fact the reader must fix.
 */
export function ClubFfbbFactTile({ clubId, club }: { clubId: string; club: Club }) {
  const [isEditing, setIsEditing] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<{ code: string }>({ defaultValues: { code: club.ffbbClubCode ?? '' } });
  const { mutate: setFfbbLink, isPending: isSaving } = useClubFfbbLinkSet(clubId);
  const { mutate: removeFfbbLink, isPending: isRemoving } = useClubFfbbLinkRemove(clubId);

  const startEditing = () => {
    reset({ code: club.ffbbClubCode ?? '' });
    setIsEditing(true);
  };

  // An empty code is a no-op, not an error: removing the link is its own
  // button, and the field is optional.
  const onSubmit = ({ code }: { code: string }) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setFfbbLink(
      { ffbbClubCode: trimmed },
      {
        onSuccess: () => setIsEditing(false),
        onError: (err) => setError('code', { message: getClubErrorMessage(err) }),
      },
    );
  };

  const handleRemove = () => {
    removeFfbbLink(undefined, {
      onSuccess: () => toast({ variant: 'success', title: 'Lien FFBB retiré' }),
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });
  };

  const icon = <BuildingIcon aria-hidden="true" className="h-5 w-5" />;

  if (isEditing) {
    return (
      <FactTile
        icon={icon}
        label="Code club FFBB"
        detail="Le code affiché dans l’URL du club sur competitions.ffbb.com. Non vérifié automatiquement — facultatif."
        actions={
          <form
            noValidate
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Code club FFBB"
                placeholder="pdl0044190"
                className="max-w-56"
                {...register('code')}
              />
              <Button type="submit" size="sm" loading={isSaving}>
                Enregistrer
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                Annuler
              </Button>
            </div>
            {errors.code?.message && <FieldError>{errors.code.message}</FieldError>}
          </form>
        }
      />
    );
  }

  if (club.ffbbClubCode) {
    return (
      <FactTile
        icon={icon}
        label="Code club FFBB"
        detail={club.ffbbClubCode}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={startEditing}>
              Modifier
            </Button>
            <Button size="sm" variant="ghost" loading={isRemoving} onClick={handleRemove}>
              Retirer
            </Button>
          </>
        }
      />
    );
  }

  return (
    <FactTile
      icon={icon}
      label="Aucun code club FFBB"
      detail="Facultatif : le code de la page du club sur competitions.ffbb.com."
      actions={
        <Button size="sm" variant="outline" onClick={startEditing}>
          Ajouter le code
        </Button>
      }
    />
  );
}
