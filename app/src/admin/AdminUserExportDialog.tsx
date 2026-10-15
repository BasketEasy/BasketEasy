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
import { FieldError } from '@basketeasy/ui/field-error';
import { Label } from '@basketeasy/ui/label';
import { Text } from '@basketeasy/ui/text';
import { Textarea } from '@basketeasy/ui/textarea';
import { toast } from '@basketeasy/ui/toast-store';
import type { PlatformUserExport } from '@basketeasy/types/platform-admin';
import { useExportPlatformUser } from './useAdminMutations';

// Mirrors ExportPlatformUserDto. Same bound as the erase dialog's, because
// an export is the other disclosure whose audit row is worthless without
// knowing which request it answered.
const MIN_REASON_LENGTH = 10;

const exportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(MIN_REASON_LENGTH, `Motif requis (${MIN_REASON_LENGTH} caractères minimum)`)
    .max(500, 'Motif trop long (500 caractères maximum)'),
});

type ExportValues = z.infer<typeof exportSchema>;

/**
 * A direct download link cannot work here: the step-up credential travels in
 * X-Platform-Token and a plain `<a href>` sends no custom headers. So the
 * bundle comes back through apiClient and becomes a file on this side.
 */
function downloadJson(data: PlatformUserExport, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked immediately: the blob holds a full copy of someone's personal
  // data in this tab's memory, and nothing needs the URL after the click.
  URL.revokeObjectURL(url);
}

export function AdminUserExportDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const { mutate: generate, isPending } = useExportPlatformUser(userId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ExportValues>({ resolver: zodResolver(exportSchema) });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset({ reason: '' });
    setOpen(next);
  };

  const onSubmit = (values: ExportValues) => {
    generate(values.reason, {
      onSuccess: (data) => {
        downloadJson(data, `kluvo-export-${userId}.json`);
        setOpen(false);
        reset({ reason: '' });
        toast({
          variant: 'success',
          title: 'Export généré',
          description: 'Le fichier JSON a été téléchargé.',
        });
      },
      onError: () =>
        setError('root', { message: 'L’export a échoué. Aucun fichier n’a été produit.' }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Exporter les données</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exporter les données de {email}</DialogTitle>
          <DialogDescription>
            Produit une copie JSON de toutes les données personnelles traitées par Kluvo, au titre
            des articles 15 et 20 du RGPD. Le fichier précise lui-même ce qu’il omet volontairement
            pour protéger les droits des tiers.
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
            <Label htmlFor="export-reason">Motif de l’export</Label>
            <Textarea
              id="export-reason"
              rows={3}
              placeholder="Ex. : demande d’accès RGPD reçue le 01/09/2026, ticket #42"
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
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Génération…' : 'Générer et télécharger'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
