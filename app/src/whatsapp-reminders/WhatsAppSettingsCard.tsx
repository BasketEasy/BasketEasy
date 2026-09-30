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
  DEFAULT_TEMPLATES,
  WHATSAPP_TEMPLATE_EXAMPLES,
  WHATSAPP_TEMPLATE_VARIABLES,
  WHATSAPP_TEMPLATE_VARIABLE_LABELS,
  renderTemplate,
  type EventShareType,
  type TeamWhatsAppSettings,
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

const KIND_OPTIONS: Array<{ value: EventShareType; label: string }> = [
  { value: 'REMINDER', label: 'Rappel' },
  { value: 'UPDATE', label: 'Changement' },
  { value: 'CANCELLATION', label: 'Annulation' },
];

const TEMPLATE_FIELDS = {
  REMINDER: 'reminderTemplate',
  UPDATE: 'updateTemplate',
  CANCELLATION: 'cancellationTemplate',
} as const satisfies Record<EventShareType, keyof TemplateFormValues>;

const KIND_COPY: Record<EventShareType, { label: string; hint: string }> = {
  REMINDER: {
    label: 'Message de rappel',
    hint: 'Une ligne dont l’information est vide pour l’événement (le RDV d’un entraînement, par exemple) est retirée du message.',
  },
  UPDATE: {
    label: 'Message de changement',
    hint: 'Proposé quand un événement change après avoir été partagé au groupe : il reprend le nouvel horaire ou le nouveau RDV.',
  },
  CANCELLATION: {
    label: 'Message d’annulation',
    hint: 'Proposé quand un événement partagé au groupe est supprimé. Le lien de réponse est facultatif : il n’y a plus rien à répondre.',
  },
};

/**
 * « Message WhatsApp » — the team's three message templates (reminder, update
 * and cancellation), edited with variables as labelled chips (never `{…}`
 * codes) and previewed for a match and a training, so the rule « a line whose
 * information is empty is dropped » is visible before anyone shares anything.
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
    body = <TemplateForm clubId={clubId} teamId={teamId} saved={data} />;
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
}: {
  clubId: string;
  teamId: string;
  saved: TeamWhatsAppSettings;
}) {
  const editorRef = useRef<TemplateEditorHandle>(null);
  const [kind, setKind] = useState<EventShareType>('REMINDER');
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
    () => reset(toFormValues(saved)),
    // The fields that seed the form, not the object's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      reset,
      saved.reminderTemplate,
      saved.updateTemplate,
      saved.cancellationTemplate,
      saved.reminderEnabled,
      saved.defaultOffsetMinutes,
    ],
  );

  const field = TEMPLATE_FIELDS[kind];
  const template = watch(field);
  const reminderEnabled = watch('reminderEnabled');
  const rendered = renderTemplate(
    template.trim() === '' ? DEFAULT_TEMPLATES[kind] : template,
    // A cancellation carries no link when the guest link is off, and never needs one.
    kind === 'CANCELLATION'
      ? { ...WHATSAPP_TEMPLATE_EXAMPLES[preview], link: null }
      : WHATSAPP_TEMPLATE_EXAMPLES[preview],
  );
  const error = errors[field]?.message;
  const ids = {
    label: `wa-template-label-${kind}`,
    error: `wa-template-error-${kind}`,
    hint: `wa-template-hint-${kind}`,
  };

  const orNull = (value: string) => (value.trim() === '' ? null : value);

  const onSubmit = (values: TemplateFormValues) =>
    save(
      {
        reminderTemplate: orNull(values.reminderTemplate),
        updateTemplate: orNull(values.updateTemplate),
        cancellationTemplate: orNull(values.cancellationTemplate),
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
            setError(field, { message });
          } else {
            toast({ variant: 'destructive', description: getClubErrorMessage(err) });
          }
        },
      },
    );

  // A refusal on a template the manager is not looking at must not be silent.
  const onInvalid = (invalid: typeof errors) => {
    const firstInvalid = KIND_OPTIONS.find(({ value }) => invalid[TEMPLATE_FIELDS[value]]);
    if (firstInvalid) setKind(firstInvalid.value);
  };

  return (
    <Card variant="panel" className="flex flex-col gap-4">
      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(onSubmit, onInvalid)(e);
        }}
        className="flex flex-col gap-3"
      >
        {!saved.hasReachableManager && (
          <Alert>
            <AlertDescription>
              Aucun gestionnaire de l’équipe ne reçoit les notifications par e-mail ou sur son
              téléphone : les rappels resteront dans la cloche de l’application.
            </AlertDescription>
          </Alert>
        )}

        <SegmentedControl
          ariaLabel="Message à modifier"
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
        />

        {kind === 'REMINDER' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="reminderEnabled"
                render={({ field: enabled }) => (
                  <Checkbox
                    id="wa-reminder-enabled"
                    checked={enabled.value}
                    onCheckedChange={(checked) => enabled.onChange(checked === true)}
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
              <Controller
                control={control}
                name="offsetValue"
                render={({ field: offset }) => (
                  <FormField
                    label="Me rappeler"
                    id="wa-reminder-offset"
                    inputMode="decimal"
                    error={errors.offsetValue?.message}
                    value={offset.value}
                    onChange={offset.onChange}
                    onBlur={offset.onBlur}
                    ref={offset.ref}
                    suffix={
                      <Controller
                        control={control}
                        name="offsetUnit"
                        render={({ field: unit }) => (
                          <SelectField
                            label="Unité de durée"
                            hideLabel
                            id="wa-reminder-offset-unit"
                            containerClassName="shrink-0"
                            options={OFFSET_UNIT_OPTIONS}
                            value={unit.value}
                            onValueChange={(value) => unit.onChange(value as OffsetUnit)}
                          />
                        )}
                      />
                    }
                  />
                )}
              />
            )}
          </div>
        )}

        <Text as="span" id={ids.label} variant="label" size="sm">
          {KIND_COPY[kind].label}
        </Text>
        <Controller
          key={kind}
          control={control}
          name={field}
          render={({ field: editor }) => (
            <Suspense fallback={<Skeleton className="h-24 w-full" />}>
              <TemplateEditor
                ref={editorRef}
                value={editor.value}
                onChange={editor.onChange}
                variables={VARIABLES}
                aria-labelledby={ids.label}
                aria-describedby={error ? ids.error : ids.hint}
              />
            </Suspense>
          )}
        />
        {error ? (
          <FieldError id={ids.error}>{error}</FieldError>
        ) : (
          <Text id={ids.hint} variant="meta" size="xs">
            {KIND_COPY[kind].hint}
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
              setValue(field, DEFAULT_TEMPLATES[kind], { shouldDirty: true, shouldValidate: true })
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

function toFormValues(saved: TeamWhatsAppSettings): TemplateFormValues {
  const { value, unit } = minutesToParts(saved.defaultOffsetMinutes);
  return {
    reminderTemplate: saved.reminderTemplate ?? DEFAULT_TEMPLATES.REMINDER,
    updateTemplate: saved.updateTemplate ?? DEFAULT_TEMPLATES.UPDATE,
    cancellationTemplate: saved.cancellationTemplate ?? DEFAULT_TEMPLATES.CANCELLATION,
    reminderEnabled: saved.reminderEnabled,
    offsetValue: value,
    offsetUnit: unit,
  };
}
