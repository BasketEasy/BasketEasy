import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { Label } from '@basketeasy/ui/label';
import { FieldError } from '@basketeasy/ui/field-error';
import { Textarea } from '@basketeasy/ui/textarea';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { ApiError } from '../api/client';
import { useErasePlatformUser } from './useAdminMutations';

// Matches the server's ErasePlatformUserDto. Long enough that "ok" doesn't
// satisfy it: the recorded justification is the entire reason a manual
// erasure goes through an audited action rather than a psql session.
const MIN_REASON_LENGTH = 10;

const eraseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(MIN_REASON_LENGTH, `Motif requis (${MIN_REASON_LENGTH} caractères minimum)`)
    .max(500, 'Motif trop long (500 caractères maximum)'),
});

type EraseValues = z.infer<typeof eraseSchema>;

/**
 * The one destructive action in the back-office, and the case CLAUDE.md's
 * modal rule is written for: irreversible, so the trigger, the justification
 * field and the confirm control stay together in one focused step instead of
 * firing on a stray click.
 */
export function AdminEraseDialog({
  userId,
  email,
  onErased,
}: {
  userId: string;
  email: string;
  onErased: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { mutate: erase, isPending } = useErasePlatformUser(userId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EraseValues>({ resolver: zodResolver(eraseSchema) });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset({ reason: '' });
    setOpen(next);
  };

  const onSubmit = (values: EraseValues) => {
    erase(values.reason, {
      onSuccess: (result) => {
        setOpen(false);
        reset({ reason: '' });
        // The dialog is gone by the time this lands, so the outcome has to
        // reach the reader as a toast rather than inline feedback.
        toast({
          variant: 'success',
          title: 'Compte effacé',
          description:
            result.unlinkedPlayerCount > 0
              ? `${result.unlinkedPlayerCount} fiche(s) joueur conservée(s), désormais sans compte lié.`
              : 'Aucune fiche joueur n’était liée à ce compte.',
        });
        onErased();
      },
      onError: (err) =>
        setError('root', {
          message:
            err instanceof ApiError && err.status === 403
              ? 'Action refusée.'
              : 'L’effacement a échoué. Rien n’a été supprimé.',
        }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">Effacer ce compte</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Effacer {email} ?</DialogTitle>
          <DialogDescription>
            Le compte et ses sessions sont supprimés définitivement. Les fiches joueur et
            l’historique statistique du club sont conservés, simplement détachés du compte.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="mt-4 flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="erase-reason">Motif de l’effacement</Label>
            <Textarea
              id="erase-reason"
              rows={3}
              placeholder="Ex. : demande d’effacement RGPD reçue le 01/09/2026, ticket #42"
              aria-invalid={errors.reason ? true : undefined}
              {...register('reason')}
            />
            <Text variant="meta" size="xs">
              Enregistré dans le journal d’audit avec votre identité. Obligatoire.
            </Text>
            <FieldError>{errors.reason?.message}</FieldError>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Effacement…' : 'Effacer définitivement'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
