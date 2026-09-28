import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Input } from '@basketeasy/ui/input';
import { FieldError } from '@basketeasy/ui/field-error';
import { toast } from '@basketeasy/ui/toast-store';
import type { Club } from '@basketeasy/types/clubs';
import { useClubFfbbLinkSet } from './useClubFfbbLinkSet';
import { useClubFfbbLinkRemove } from './useClubFfbbLinkRemove';
import { getClubErrorMessage } from './clubErrorMessages';
import { Text } from '@basketeasy/ui/text';

/** Club-header FFBB link block, per docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md — same
 * inline (not Dialog) treatment as the team-link disclosure, since the club code is a single optional,
 * unvalidated field with no destructive action to guard. */
export function ClubFfbbLinkControl({ clubId, club }: { clubId: string; club: Club }) {
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

  if (isEditing) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Code club FFBB"
            placeholder="pdl0044190"
            className="max-w-[220px]"
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
        <Text variant="meta" size="xs">
          Le code affiché dans l&apos;URL du club sur competitions.ffbb.com. Non vérifié
          automatiquement — facultatif.
        </Text>
      </form>
    );
  }

  if (club.ffbbClubCode) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant="outline" tone="neutral">
          FFBB
        </Badge>
        <Text as="span" variant="body" size="sm" className="font-mono">
          {club.ffbbClubCode}
        </Text>
        <Button size="sm" variant="outline" onClick={startEditing}>
          Modifier le lien
        </Button>
        <Button size="sm" variant="ghost" loading={isRemoving} onClick={handleRemove}>
          Supprimer le lien
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={startEditing}>
      Lier ce club à la FFBB
    </Button>
  );
}
