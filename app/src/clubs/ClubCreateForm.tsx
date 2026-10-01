import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { toast } from '@basketeasy/ui/toast-store';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { cn } from '@basketeasy/ui/cn';
import { useClubCreate } from './useClubCreate';
import { getClubErrorMessage } from './clubErrorMessages';
import { Text } from '@basketeasy/ui/text';

const clubSchema = z.object({
  name: z.string().min(2, 'Le nom du club doit contenir au moins 2 caractères'),
  ffbbClubCode: z.string().optional(),
});

type ClubFormValues = z.infer<typeof clubSchema>;

export function ClubCreateForm() {
  const navigate = useNavigate();
  const { mutate: createClub, isPending } = useClubCreate();
  const [isFfbbOpen, setIsFfbbOpen] = useState(false);
  const ffbbPanelId = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClubFormValues>({ resolver: zodResolver(clubSchema) });

  const onSubmit = (values: ClubFormValues) => {
    createClub(
      { name: values.name, ffbbClubCode: values.ffbbClubCode?.trim() || undefined },
      {
        // useClubCreate's onSuccess writes the new ADMIN membership into the
        // cached account/me query synchronously, but TanStack Query notifies
        // that query's subscribers (AccountProvider's useSession) via a
        // macrotask (setTimeout 0), not synchronously. Navigating in this
        // same tick would mount MembersPage — and run its `!isAdmin` guard —
        // before that notification lands, bouncing the brand-new admin to
        // /dashboard. Deferring the navigation by one macrotask lets the
        // already-scheduled cache notification run first, so useIsClubAdmin
        // sees the new membership on MembersPage's first render.
        onSuccess: (club) => {
          toast({ variant: 'success', title: 'Club créé' });
          setTimeout(() => navigate(`/clubs/${club.id}/members`), 0);
        },
        onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
      },
    );
  };

  return (
    <Card>
      <CardContent>
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
            label="Nom du club"
            id="club-name"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="rounded-md border border-border bg-surface-2">
            <button
              type="button"
              aria-expanded={isFfbbOpen}
              aria-controls={ffbbPanelId}
              onClick={() => setIsFfbbOpen((open) => !open)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3.5 py-2.5 text-left text-sm font-bold text-charcoal',
                focusRing,
              )}
            >
              Lier ce club à la FFBB
              <Text as="span" variant="meta" aria-hidden="true">
                {isFfbbOpen ? '▴' : '▾'}
              </Text>
            </button>
            {isFfbbOpen && (
              <div id={ffbbPanelId} className="border-t border-border px-3.5 pb-3.5 pt-3.5">
                <FormField
                  label="Code club FFBB"
                  id="club-ffbb-code"
                  placeholder="pdl0044190"
                  error={errors.ffbbClubCode?.message}
                  {...register('ffbbClubCode')}
                />
                <Text variant="meta" size="xs" className="mt-1.5">
                  Facultatif : le code de la page du club sur competitions.ffbb.com.
                </Text>
              </div>
            )}
          </div>

          <Button type="submit" loading={isSubmitting || isPending}>
            Créer le club
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
