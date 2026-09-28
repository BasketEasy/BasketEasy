import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Controller, useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
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
import { SelectField } from '@basketeasy/ui/select-field';
import { Text } from '@basketeasy/ui/text';
import { Textarea } from '@basketeasy/ui/textarea';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import type {
  AdminActionResult,
  AdminReasonRequest,
} from '@basketeasy/types/platform-admin-actions';
import { adminActionErrorMessage, reasonSchema, toastActionDone } from './adminActionForm';
import { useAdminAction } from './useAdminAction';

// The confirm step every support action goes through, per the validated
// canvas linked from docs/superpowers/specs/2026-09-28-backoffice-v2-part5-support-actions.md:
// what will happen, the facts it acts on, a mandatory reason, confirm/cancel.
// A centred dialog on desktop, a bottom sheet on a phone.

export function AdminReasonField({
  registration,
  error,
  placeholder = 'Ex. : ticket #812, demande du président du club par téléphone',
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Motif</Label>
      <Textarea
        id={id}
        rows={3}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        {...registration}
      />
      <Text variant="meta" size="xs">
        10 caractères minimum. Conservé dans le journal d’audit avec votre identité.
      </Text>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export interface AdminActionFact {
  label: string;
  value: ReactNode;
}

function AdminActionFacts({ facts }: { facts: AdminActionFact[] }) {
  if (facts.length === 0) return null;
  return (
    <Card variant="inset" className="flex flex-col gap-1">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-wrap gap-x-1.5">
          <Text as="span" variant="meta" size="sm">
            {fact.label} ·
          </Text>
          <Text as="span" size="sm" className="break-all">
            {fact.value}
          </Text>
        </div>
      ))}
    </Card>
  );
}

/** Dialog chrome shared by every action: header, placement by viewport. */
export function AdminActionDialogFrame({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktopViewport();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent variant={isDesktop ? 'dialog' : 'sheet'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function AdminRootError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** A field an action asks for beyond its reason; always a non-empty string. */
interface AdminActionField {
  name: string;
  label: string;
  kind: 'text' | 'select';
  requiredMessage: string;
  /** Mirrors the server DTO's bounds for the field. */
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

type Values = AdminReasonRequest & Record<string, string>;

const NO_FACTS: AdminActionFact[] = [];
const NO_FIELDS: AdminActionField[] = [];

/**
 * A support action behind a confirm step. `path` is its route under
 * /admin; the form posts `{ reason, ...fields }` there.
 */
export function AdminActionDialog({
  trigger,
  title,
  description,
  facts = NO_FACTS,
  fields = NO_FIELDS,
  note,
  confirmLabel,
  danger = false,
  path,
  onDone,
}: {
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  facts?: AdminActionFact[];
  fields?: AdminActionField[];
  note?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  path: string;
  /** After the success toast, e.g. to leave a page whose record is gone. */
  onDone?: (result: AdminActionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useAdminAction<AdminReasonRequest>(path);
  const schema = useMemo<z.ZodType<Values, Values>>(
    () =>
      z.object({
        reason: reasonSchema,
        ...Object.fromEntries(
          fields.map((field) => [
            field.name,
            z
              .string()
              .trim()
              .min(field.minLength ?? 1, field.requiredMessage)
              .max(field.maxLength ?? 500, `${field.maxLength ?? 500} caractères maximum`),
          ]),
        ),
      }),
    [fields],
  );
  const emptyValues = useMemo(
    () => Object.fromEntries([['reason', ''], ...fields.map((field) => [field.name, ''])]),
    [fields],
  ) as Values;
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(emptyValues);
    setOpen(next);
  };

  const onSubmit = (values: Values) => {
    mutate(values, {
      onSuccess: (result) => {
        handleOpenChange(false);
        toastActionDone(result);
        onDone?.(result);
      },
      onError: (error) => setError('root', { message: adminActionErrorMessage(error) }),
    });
  };

  return (
    <AdminActionDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title={title}
      description={description}
    >
      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="mt-4 flex flex-col gap-4"
      >
        <AdminRootError message={errors.root?.message} />
        <AdminActionFacts facts={facts} />
        {fields.map((field) =>
          field.kind === 'select' ? (
            <Controller
              key={field.name}
              name={field.name}
              control={control}
              render={({ field: control, fieldState }) => (
                <SelectField
                  label={field.label}
                  placeholder={field.placeholder}
                  options={field.options ?? []}
                  value={control.value || undefined}
                  onValueChange={control.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          ) : (
            <FormField
              key={field.name}
              label={field.label}
              placeholder={field.placeholder}
              hint={field.hint}
              error={errors[field.name]?.message}
              {...register(field.name)}
            />
          ),
        )}
        <AdminReasonField registration={register('reason')} error={errors.reason?.message} />
        {note}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant={danger ? 'destructive' : 'default'} disabled={isPending}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </AdminActionDialogFrame>
  );
}
