import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Card } from '@basketeasy/ui/card';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { FieldError } from '@basketeasy/ui/field-error';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { Text } from '@basketeasy/ui/text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import { toast } from '@basketeasy/ui/toast-store';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { Gender } from '@basketeasy/types/teams';
import {
  PARENTAL_CONSENT_REQUIRED_CODE,
  isMinorBirthDate,
} from '@basketeasy/types/parental-consent';
import { ApiError } from '../api/client';
import { useAccount } from '../auth/useAccount';
import { usePlayerCreate } from './usePlayerCreate';
import { getClubErrorMessage } from './clubErrorMessages';
import {
  CONSENT_ATTESTATION_LABEL,
  CONSENT_ATTESTER_HINT,
  CONSENT_EXPLAINER,
  CONSENT_REQUIRED_BY_SERVER,
  defaultAttesterName,
} from './parentalConsentCopy';

const UNLINKED = 'none';
const UNSPECIFIED_GENDER = 'unspecified';

const playerSchema = z
  .object({
    firstName: z.string().min(1, 'Prénom requis'),
    lastName: z.string().min(1, 'Nom requis'),
    userId: z.string(),
    nationalId: z.string().max(40, 'Maximum 40 caractères'),
    licenseNumber: z.string().max(40, 'Maximum 40 caractères'),
    birthDate: z.string(),
    gender: z.string(),
    licenseType: z.string().max(20, 'Maximum 20 caractères'),
    parentalConsentAttested: z.boolean(),
    parentalConsentAttestedByName: z.string(),
  })
  // The API rejects a minor with no attestation (400
  // PARENTAL_CONSENT_REQUIRED); mirroring the rule here means the admin is
  // told before the round trip, from the same shared isMinorBirthDate the
  // server uses, so the two can't drift apart.
  .superRefine((values, ctx) => {
    if (!isMinorBirthDate(values.birthDate)) {
      return;
    }
    if (!values.parentalConsentAttested) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentalConsentAttested'],
        message: 'Autorisation parentale requise pour un joueur mineur',
      });
    }
    if (!values.parentalConsentAttestedByName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentalConsentAttestedByName'],
        message: 'Indiquez qui atteste avoir recueilli l’autorisation',
      });
    }
  });

type PlayerFormValues = z.infer<typeof playerSchema>;

export function PlayerCreateForm({
  clubId,
  linkableMembers = [],
  onSuccess,
}: {
  clubId: string;
  /** Club members not yet linked to another player, offered as a link target. */
  linkableMembers?: ClubMember[];
  onSuccess?: () => void;
}) {
  const { user } = useAccount();
  const { mutate: createPlayer, isPending } = usePlayerCreate(clubId);
  // Set only when the API answers PARENTAL_CONSENT_REQUIRED for a birth date
  // this form read as an adult's. Keeping it in state rather than deriving it
  // is the whole point: without it the consent block stays hidden and the
  // field error the API asked us to show would have nowhere to render.
  const [serverRequiresConsent, setServerRequiresConsent] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      userId: UNLINKED,
      nationalId: '',
      licenseNumber: '',
      birthDate: '',
      gender: UNSPECIFIED_GENDER,
      licenseType: '',
      parentalConsentAttested: false,
      parentalConsentAttestedByName: defaultAttesterName(user),
    },
  });

  // Recomputed as the date is typed, so the block appears the moment the
  // entered birth date makes the player a minor — never stored on the record,
  // since a stored flag is wrong the day after their eighteenth birthday.
  const isMinor = isMinorBirthDate(watch('birthDate'));
  const showConsentBlock = isMinor || serverRequiresConsent;

  const onSubmit = (values: PlayerFormValues) => {
    createPlayer(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        userId: values.userId === UNLINKED ? undefined : values.userId,
        nationalId: values.nationalId.trim() || undefined,
        licenseNumber: values.licenseNumber.trim() || undefined,
        birthDate: values.birthDate || undefined,
        gender: values.gender === UNSPECIFIED_GENDER ? undefined : (values.gender as Gender),
        licenseType: values.licenseType.trim() || undefined,
        // Keyed off the tick rather than off isMinorBirthDate: when the
        // server has told us it wants a consent for a birth date this form
        // read as an adult's, re-deriving the flag here would drop the
        // attestation the admin just gave and resubmit the same rejected
        // payload. An unticked box on a non-minor still sends nothing, since
        // the block is only rendered when consent is in play.
        parentalConsent: values.parentalConsentAttested
          ? { attestedByName: values.parentalConsentAttestedByName.trim() }
          : undefined,
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Joueur ajouté' });
          reset();
          onSuccess?.();
        },
        onError: (err) => {
          // The one API error this form can point at a specific control. The
          // code exists precisely so a consent rejection lands on the
          // attestation checkbox instead of the generic "informations
          // invalides" a bare 400 would produce — which is all the reader
          // would otherwise get if the client and the server ever disagreed
          // about whether this birth date belongs to a minor.
          if (err instanceof ApiError && err.code === PARENTAL_CONSENT_REQUIRED_CODE) {
            setServerRequiresConsent(true);
            setError('parentalConsentAttested', { message: CONSENT_REQUIRED_BY_SERVER });
            return;
          }
          setError('root', { message: getClubErrorMessage(err) });
        },
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Prénom"
        id="player-first-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Nom"
        id="player-last-name"
        error={errors.lastName?.message}
        {...register('lastName')}
      />
      <FormField
        label="Date de naissance"
        id="player-birth-date"
        type="date"
        error={errors.birthDate?.message}
        {...register('birthDate')}
      />

      {showConsentBlock && (
        <Card variant="inset" className="flex flex-col gap-3">
          <Text variant="label" as="span">
            Autorisation parentale
          </Text>
          <Text variant="meta">{CONSENT_EXPLAINER}</Text>
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="parentalConsentAttested"
              render={({ field }) => (
                <Checkbox
                  id="player-parental-consent"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor="player-parental-consent">{CONSENT_ATTESTATION_LABEL}</Label>
          </div>
          {errors.parentalConsentAttested?.message && (
            <FieldError>{errors.parentalConsentAttested.message}</FieldError>
          )}
          <FormField
            label="Nom de la personne qui atteste"
            hint={CONSENT_ATTESTER_HINT}
            id="player-parental-consent-by"
            error={errors.parentalConsentAttestedByName?.message}
            {...register('parentalConsentAttestedByName')}
          />
        </Card>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="player-gender">Sexe</Label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="player-gender" aria-label="Sexe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED_GENDER}>Non renseigné</SelectItem>
                <SelectItem value="MEN">Homme</SelectItem>
                <SelectItem value="WOMEN">Femme</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <FormField
        label="N° national (optionnel)"
        id="player-national-id"
        error={errors.nationalId?.message}
        {...register('nationalId')}
      />
      <FormField
        label="N° licence (optionnel)"
        id="player-license-number"
        error={errors.licenseNumber?.message}
        {...register('licenseNumber')}
      />
      <FormField
        label="Type de licence (optionnel)"
        id="player-license-type"
        error={errors.licenseType?.message}
        {...register('licenseType')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="player-linked-member">Compte lié (optionnel)</Label>
        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                const member = linkableMembers.find((m) => m.userId === value);
                if (member?.firstName && member?.lastName) {
                  setValue('firstName', member.firstName, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  setValue('lastName', member.lastName, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }
              }}
            >
              <SelectTrigger id="player-linked-member" aria-label="Compte lié (optionnel)">
                <SelectValue placeholder="Aucun compte lié" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED}>Aucun compte lié</SelectItem>
                {linkableMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <Button type="submit" loading={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
