import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { FieldError } from '@basketeasy/ui/field-error';
import { FormField } from '@basketeasy/ui/form-field';
import { Input } from '@basketeasy/ui/input';
import { Label } from '@basketeasy/ui/label';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import type {
  AdminCreateClubRequest,
  AdminCreateClubResult,
} from '@basketeasy/types/platform-admin-actions';
import {
  ADMIN_SEARCH_MIN_LENGTH,
  type AdminSearchHit,
} from '@basketeasy/types/platform-admin-search';
import { ApiError } from '../../api/client';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePlatformSession } from '../platformSession';
import { useAdminSearch } from '../useAdminQueries';
import { adminPaths } from '../shared/adminPaths';
import { AdminActionDialogFrame, AdminReasonField, AdminRootError } from './AdminActionDialog';
import { adminActionErrorMessage, reasonSchema, toastActionDone } from './adminActionForm';
import { useAdminAction } from './useAdminAction';

// Same bounds as the server's AdminCreateClubDto.
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nom requis (2 caractères minimum)')
    .max(120, 'Nom trop long (120 caractères maximum)'),
  ffbbClubCode: z.string().trim().max(60, 'Code trop long (60 caractères maximum)'),
  firstAdminUserId: z.string().min(1, 'Choisissez le premier admin'),
  reason: reasonSchema,
});

type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: '', ffbbClubCode: '', firstAdminUserId: '', reason: '' };

function AccountOption({ hit }: { hit: AdminSearchHit }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" variant="label" size="sm">
          {hit.label}
        </Text>
        {hit.sublabel && (
          <Text as="span" variant="meta" size="xs" className="break-all">
            {hit.sublabel}
          </Text>
        )}
      </span>
      {hit.emailVerified === false && (
        <Badge variant="soft" tone="brand">
          Non vérifiée
        </Badge>
      )}
    </span>
  );
}

/**
 * The first-admin picker: the global search restricted to accounts, so a
 * SUPPORT caller finds by exact e-mail and a DATA_OFFICER by name too. The
 * typed text is UI state; only the picked id is a form value.
 */
function FirstAdminPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (hit: AdminSearchHit) => void;
  error?: string;
}) {
  const inputId = useId();
  const labelId = useId();
  const { session } = usePlatformSession();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<AdminSearchHit | null>(null);
  const search = useAdminSearch(useDebouncedValue(text));
  const searching = text.trim().length >= ADMIN_SEARCH_MIN_LENGTH;

  const found = search.data?.exactId?.kind === 'user' ? [search.data.exactId] : [];
  const hits = [...found, ...(search.data?.groups.user ?? [])];
  // Keep the chosen account on screen while the text changes under it.
  const options = picked && !hits.some((hit) => hit.id === picked.id) ? [picked, ...hits] : hits;

  let status: string | null = null;
  if (searching && search.isError) status = 'Recherche indisponible. Réessayez dans un instant.';
  else if (searching && search.isPending) status = 'Recherche…';
  else if (searching && hits.length === 0)
    status =
      session?.role === 'DATA_OFFICER'
        ? 'Aucun compte trouvé.'
        : 'Aucun compte trouvé. Avec le profil support, saisissez l’adresse e-mail complète du compte.';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} id={labelId}>
        Premier admin
      </Label>
      <Input
        id={inputId}
        type="search"
        value={text}
        placeholder={
          session?.role === 'DATA_OFFICER' ? 'Nom ou adresse e-mail' : 'Adresse e-mail complète'
        }
        onChange={(event) => setText(event.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {options.length > 0 && (
        <RadioCardGroup<string>
          aria-labelledby={labelId}
          tone="choice"
          indicator
          value={value || null}
          onChange={(id) => {
            const hit = options.find((option) => option.id === id);
            if (!hit) return;
            setPicked(hit);
            onChange(hit);
          }}
          className="flex flex-col gap-1.5"
          options={options.map((hit) => ({
            value: hit.id,
            render: () => <AccountOption hit={hit} />,
          }))}
        />
      )}
      {status && (
        <Card variant="placeholder">
          <Text variant="meta" size="sm" role="status">
            {status}
          </Text>
        </Card>
      )}
      {picked?.emailVerified === false && picked.id === value && (
        <Card variant="inset" tone="accent">
          <Text size="sm" tone="accent" role="status">
            Adresse non vérifiée : ce compte ne pourra ni ajouter des membres ni nommer des
            gestionnaires avant d’avoir confirmé son e-mail.
          </Text>
        </Card>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * « Créer un club »: the club, its first ADMIN (an existing account) and the
 * reason, in one audited step. On success the club's page opens, its first
 * admin already listed.
 */
export function AdminCreateClubDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useAdminAction<AdminCreateClubRequest, AdminCreateClubResult>(
    'clubs',
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(EMPTY);
    setOpen(next);
  };

  const onSubmit = (values: Values) => {
    mutate(
      {
        name: values.name,
        ffbbClubCode: values.ffbbClubCode || undefined,
        firstAdminUserId: values.firstAdminUserId,
        reason: values.reason,
      },
      {
        onSuccess: (result) => {
          handleOpenChange(false);
          toastActionDone(result);
          void navigate(adminPaths.club(result.clubId));
        },
        onError: (error) => {
          // The only unique rule a new club can break is its FFBB code, and
          // the only lookup that can miss is the first admin.
          if (error instanceof ApiError && error.status === 409) {
            setError('ffbbClubCode', { message: error.message });
          } else if (error instanceof ApiError && error.status === 404) {
            setError('firstAdminUserId', { message: error.message });
          } else {
            setError('root', { message: adminActionErrorMessage(error) });
          }
        },
      },
    );
  };

  return (
    <AdminActionDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button>Créer un club</Button>}
      title="Créer un club"
      description="Le club est créé avec un premier admin, choisi parmi les comptes existants. Il pourra ensuite inviter les autres membres."
    >
      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="mt-4 flex flex-col gap-4"
      >
        <AdminRootError message={errors.root?.message} />
        <FormField label="Nom du club" error={errors.name?.message} {...register('name')} />
        <FormField
          label="Code FFBB (facultatif)"
          hint="Il permet ensuite d’importer les matchs depuis la FFBB."
          error={errors.ffbbClubCode?.message}
          {...register('ffbbClubCode')}
        />
        <Controller
          name="firstAdminUserId"
          control={control}
          render={({ field, fieldState }) => (
            <FirstAdminPicker
              value={field.value}
              onChange={(hit) => field.onChange(hit.id)}
              error={fieldState.error?.message}
            />
          )}
        />
        <AdminReasonField
          registration={register('reason')}
          error={errors.reason?.message}
          placeholder="Ex. : demande du comité 44, ticket #830"
        />
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={isPending}>
            Créer le club
          </Button>
        </div>
      </form>
    </AdminActionDialogFrame>
  );
}
