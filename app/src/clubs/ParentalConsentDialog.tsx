import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Checkbox } from '@basketeasy/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FieldError } from '@basketeasy/ui/field-error';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { Player } from '@basketeasy/types/players';
import { useAccount } from '../auth/useAccount';
import { useRecordParentalConsent } from './useRecordParentalConsent';
import { getClubErrorMessage } from './clubErrorMessages';
import {
  CONSENT_ATTESTATION_LABEL,
  CONSENT_ATTESTER_HINT,
  CONSENT_EXPLAINER,
  defaultAttesterName,
} from './parentalConsentCopy';

const consentSchema = z.object({
  isAttested: z.boolean().refine((value) => value, {
    message: 'Cochez la case pour confirmer que vous détenez l’autorisation.',
  }),
  attestedByName: z.string().trim().min(1, 'Indiquez qui atteste avoir recueilli l’autorisation.'),
});

type ConsentFormValues = z.infer<typeof consentSchema>;

/**
 * Records the parental-consent attestation for a minor who already exists —
 * the path for players created by bulk import, which is exempt from the
 * create-time requirement (see `docs/decisions/rgpd-and-backoffice.md`).
 *
 * A dialog rather than an inline control, per CLAUDE.md's rule: two fields,
 * rarely used, and it writes a legal record that outlives the player's own
 * roster entry.
 */
export function ParentalConsentDialog({ clubId, player }: { clubId: string; player: Player }) {
  const { user } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const { mutate: recordConsent, isPending } = useRecordParentalConsent(clubId, player.id);
  // A missing tick or name belongs next to its field (FieldError), a
  // rejected write belongs to the form (setError('root') + Alert).
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConsentFormValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: { isAttested: false, attestedByName: defaultAttesterName(user) },
  });

  const hasConsent = player.parentalConsentGivenAt !== null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // Every open starts from an unticked box and the current user's name.
    if (open) {
      reset({ isAttested: false, attestedByName: defaultAttesterName(user) });
    }
  };

  const onSubmit = (values: ConsentFormValues) => {
    recordConsent(
      { attestedByName: values.attestedByName },
      {
        onSuccess: () => {
          // The dialog closes, so the outcome has nowhere inline left to live.
          toast({ variant: 'success', title: 'Autorisation parentale enregistrée' });
          handleOpenChange(false);
        },
        onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
      },
    );
  };

  const checkboxId = `consent-attested-${player.id}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Autorisation parentale</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Autorisation parentale — {player.firstName} {player.lastName}
          </DialogTitle>
          <DialogDescription>{CONSENT_EXPLAINER}</DialogDescription>
        </DialogHeader>

        {errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}

        {hasConsent && (
          <Text variant="meta">
            Déjà enregistrée le{' '}
            {new Date(player.parentalConsentGivenAt as string).toLocaleDateString('fr-FR')} ; la
            précédente est conservée.
          </Text>
        )}

        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          <Controller
            control={control}
            name="isAttested"
            render={({ field }) => (
              <div className="flex items-start gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={field.value}
                  aria-invalid={errors.isAttested ? true : undefined}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label htmlFor={checkboxId}>{CONSENT_ATTESTATION_LABEL}</Label>
              </div>
            )}
          />
          {errors.isAttested?.message && <FieldError>{errors.isAttested.message}</FieldError>}

          <FormField
            label="Nom de la personne qui atteste"
            hint={CONSENT_ATTESTER_HINT}
            id={`consent-attested-by-${player.id}`}
            error={errors.attestedByName?.message}
            {...register('attestedByName')}
          />

          <Button type="submit" loading={isSubmitting || isPending}>
            Enregistrer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
