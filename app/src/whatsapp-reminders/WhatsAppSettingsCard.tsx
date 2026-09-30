import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import { SelectField } from '@basketeasy/ui/select-field';
import { Card } from '@basketeasy/ui/card';
import { FieldError } from '@basketeasy/ui/field-error';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { Skeleton } from '@basketeasy/ui/skeleton';
import type { TemplateEditorHandle } from '@basketeasy/ui/template-editor';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import {
  DEFAULT_REMINDER_TEMPLATE,
  WHATSAPP_TEMPLATE_EXAMPLES,
  WHATSAPP_TEMPLATE_VARIABLES,
  WHATSAPP_TEMPLATE_VARIABLE_LABELS,
  renderTemplate,
} from '@basketeasy/types/whatsapp-reminder';
import { ApiError } from '../api/client';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  OFFSET_UNIT_OPTIONS,
  minutesToParts,
  partsToMinutes,
  type OffsetUnit,
} from './reminderOffset';
import { templateSchema, type TemplateFormValues } from './templateSchema';
import { useTeamWhatsAppSettings, useUpdateTeamWhatsAppSettings } from './useTeamWhatsAppSettings';

// Tiptap is fetched only when a manager opens team settings, never by the
// players and parents who share the same bundle.
const TemplateEditor = lazy(() =>
  import('@basketeasy/ui/template-editor').then((m) => ({ default: m.TemplateEditor })),
);

const VARIABLES = WHATSAPP_TEMPLATE_VARIABLES.map((key) => ({
  key,
  label: WHATSAPP_TEMPLATE_VARIABLE_LABELS[key],
}));

type PreviewKind = 'MATCH' | 'TRAINING';

const PREVIEW_OPTIONS = [
  { value: 'MATCH', label: 'Match' },
  { value: 'TRAINING', label: 'Entraînement' },
] as const;

/**
 * « Message WhatsApp » — the team's reminder template, edited with variables
 * as labelled chips (never `{…}` codes) and previewed for a match and a
 * training, so the rule « a line whose information is empty is dropped » is
 * visible before anyone shares anything.
 */
export function WhatsAppSettingsCard({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, isLoading, refetch } = useTeamWhatsAppSettings(clubId, teamId);
  const heading = <SectionHeading as="h2">Message WhatsApp</SectionHeading>;

  let body: ReactNode;
  if (isError) {
    body = (
      <QueryError
        title="Message indisponible"
        description="Le modèle de message n’a pas pu être chargé."
        onRetry={() => refetch()}
      />
    );
  } else if (isLoading || data === undefined) {
    body = <Skeleton className="h-40 w-full" />;
  } else {
    body = (
      <TemplateForm
        clubId={clubId}
        teamId={teamId}
        saved={{
          template: data.reminderTemplate ?? DEFAULT_REMINDER_TEMPLATE,
          enabled: data.reminderEnabled,
          offsetMinutes: data.defaultOffsetMinutes,
        }}
        hasReachableManager={data.hasReachableManager}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {heading}
      {body}
    </section>
  );
}

function TemplateForm({
  clubId,
  teamId,
  saved,
  hasReachableManager,
}: {
  clubId: string;
  teamId: string;
  saved: { template: string; enabled: boolean; offsetMinutes: number };
  hasReachableManager: boolean;
}) {
  const editorRef = useRef<TemplateEditorHandle>(null);
  const [preview, setPreview] = useState<PreviewKind>('MATCH');
  const { mutate: save, isPending } = useUpdateTeamWhatsAppSettings(clubId, teamId);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: toFormValues(saved),
  });

  // A refetch after a save re-seeds the form with what the server now holds.
  useEffect(
    () =>
      reset(
        toFormValues({
          template: saved.template,
          enabled: saved.enabled,
          offsetMinutes: saved.offsetMinutes,
        }),
      ),
    [reset, saved.template, saved.enabled, saved.offsetMinutes],
  );

  const template = watch('reminderTemplate');
  const reminderEnabled = watch('reminderEnabled');
  const rendered = renderTemplate(
    template.trim() === '' ? DEFAULT_REMINDER_TEMPLATE : template,
    WHATSAPP_TEMPLATE_EXAMPLES[preview],
  );

  const onSubmit = (values: TemplateFormValues) =>
    save(
      {
        reminderTemplate: values.reminderTemplate.trim() === '' ? null : values.reminderTemplate,
        reminderEnabled: values.reminderEnabled,
        defaultOffsetMinutes: partsToMinutes(values.offsetValue, values.offsetUnit) ?? undefined,
      },
      {
        onSuccess: ({ guestLinkEnabled }) =>
          toast({
            variant: 'success',
            title: 'Réglages enregistrés',
            ...(guestLinkEnabled
              ? { description: 'Le lien de réponse sans compte a été activé pour l’équipe.' }
              : {}),
          }),
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : getClubErrorMessage(err);
          if (err instanceof ApiError && err.status === 400) {
            setError('reminderTemplate', { message });
          } else {
            toast({ variant: 'destructive', description: getClubErrorMessage(err) });
          }
        },
      },
    );

  return (
    <Card variant="panel" className="flex flex-col gap-4">
      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-3"
      >
        {!hasReachableManager && (
          <Alert>
            <AlertDescription>
              Aucun gestionnaire de l’équipe ne reçoit les notifications par e-mail ou sur son
              téléphone : les rappels resteront dans la cloche de l’application.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="reminderEnabled"
              render={({ field }) => (
                <Checkbox
                  id="wa-reminder-enabled"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor="wa-reminder-enabled">Rappel automatique</Label>
          </div>
          <Text variant="meta" size="xs">
            Les gestionnaires reçoivent une notification pour partager le message dans le groupe
            WhatsApp de l’équipe. Le lien de réponse est activé au besoin.
          </Text>
          {reminderEnabled && (
            <div className="flex flex-wrap items-start gap-2">
              <Controller
                control={control}
                name="offsetValue"
                render={({ field }) => (
                  <FormField
                    label="Me rappeler"
                    id="wa-reminder-offset"
                    inputMode="decimal"
                    error={errors.offsetValue?.message}
                    containerClassName="min-w-0 flex-1"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              <Controller
                control={control}
                name="offsetUnit"
                render={({ field }) => (
                  <SelectField
                    label="Unité de durée"
                    hideLabel
                    id="wa-reminder-offset-unit"
                    options={OFFSET_UNIT_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value as OffsetUnit)}
                  />
                )}
              />
            </div>
          )}
        </div>

        <Text as="span" id="wa-template-label" variant="label" size="sm">
          Message de rappel
        </Text>
        <Controller
          control={control}
          name="reminderTemplate"
          render={({ field }) => (
            <Suspense fallback={<Skeleton className="h-24 w-full" />}>
              <TemplateEditor
                ref={editorRef}
                value={field.value}
                onChange={field.onChange}
                variables={VARIABLES}
                aria-labelledby="wa-template-label"
                aria-describedby={
                  errors.reminderTemplate ? 'wa-template-error' : 'wa-template-hint'
                }
              />
            </Suspense>
          )}
        />
        {errors.reminderTemplate?.message ? (
          <FieldError id="wa-template-error">{errors.reminderTemplate.message}</FieldError>
        ) : (
          <Text id="wa-template-hint" variant="meta" size="xs">
            Une ligne dont l’information est vide pour l’événement (le RDV d’un entraînement, par
            exemple) est retirée du message.
          </Text>
        )}

        <div className="flex flex-col gap-1.5">
          <Text as="span" variant="label" size="sm">
            Insérer une info
          </Text>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => editorRef.current?.insertVariable(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={isPending}>
            Enregistrer
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setValue('reminderTemplate', DEFAULT_REMINDER_TEMPLATE, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            Rétablir le texte par défaut
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text as="span" variant="label" size="sm">
            Aperçu
          </Text>
          <SegmentedControl
            ariaLabel="Type d’événement de l’aperçu"
            value={preview}
            options={PREVIEW_OPTIONS}
            onChange={setPreview}
          />
        </div>
        <Card variant="inset">
          <Text variant="body" size="sm" className="whitespace-pre-line" aria-live="polite">
            {rendered}
          </Text>
        </Card>
      </div>
    </Card>
  );
}

function toFormValues(saved: {
  template: string;
  enabled: boolean;
  offsetMinutes: number;
}): TemplateFormValues {
  const { value, unit } = minutesToParts(saved.offsetMinutes);
  return {
    reminderTemplate: saved.template,
    reminderEnabled: saved.enabled,
    offsetValue: value,
    offsetUnit: unit,
  };
}
