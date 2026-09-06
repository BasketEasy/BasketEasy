import { useState } from 'react';
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

/**
 * Records the parental-consent attestation for a minor who already exists —
 * the path for players created by bulk import, which is exempt from the
 * create-time requirement (see the data-retention design doc).
 *
 * A dialog rather than an inline control, per CLAUDE.md's rule: two fields,
 * rarely used, and it writes a legal record that outlives the player's own
 * roster entry.
 */
export function ParentalConsentDialog({ clubId, player }: { clubId: string; player: Player }) {
  const { user } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [attestedByName, setAttestedByName] = useState(() => defaultAttesterName(user));
  const [isAttested, setIsAttested] = useState(false);
  // Two separate slots on purpose: a missing tick belongs next to the tick
  // box (FieldError), a rejected write belongs to the form (Alert).
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutate: recordConsent, isPending } = useRecordParentalConsent(clubId, player.id);

  const hasConsent = player.parentalConsentGivenAt !== null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setIsAttested(false);
      setFieldError(null);
      setSubmitError(null);
    }
  };

  const handleSubmit = () => {
    if (!isAttested) {
      setFieldError('Cochez la case pour confirmer que vous détenez l’autorisation.');
      return;
    }
    if (!attestedByName.trim()) {
      setFieldError('Indiquez qui atteste avoir recueilli l’autorisation.');
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    recordConsent(
      { attestedByName: attestedByName.trim() },
      {
        onSuccess: () => {
          // The dialog closes, so the outcome has nowhere inline left to live.
          toast({ variant: 'success', title: 'Autorisation parentale enregistrée' });
          handleOpenChange(false);
        },
        onError: (err) => setSubmitError(getClubErrorMessage(err)),
      },
    );
  };

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

        {submitError && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {hasConsent && (
          <Text variant="meta">
            Déjà enregistrée le{' '}
            {new Date(player.parentalConsentGivenAt as string).toLocaleDateString('fr-FR')} ; la
            précédente est conservée.
          </Text>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`consent-attested-${player.id}`}
              checked={isAttested}
              onCheckedChange={(checked) => {
                setIsAttested(checked === true);
                setFieldError(null);
              }}
            />
            <Label htmlFor={`consent-attested-${player.id}`}>{CONSENT_ATTESTATION_LABEL}</Label>
          </div>
          {fieldError && <FieldError>{fieldError}</FieldError>}

          <FormField
            label="Nom de la personne qui atteste"
            hint={CONSENT_ATTESTER_HINT}
            id={`consent-attested-by-${player.id}`}
            value={attestedByName}
            onChange={(e) => setAttestedByName(e.target.value)}
          />

          <Button type="button" loading={isPending} onClick={handleSubmit}>
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
