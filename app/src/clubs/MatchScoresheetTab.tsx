import { useEffect, useRef, useState, type RefObject } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Check } from '@basketeasy/ui/icons/check';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDate } from './eventDateFormat';
import { ScoresheetExtractionCard } from './ScoresheetExtractionCard';
import { useEventScoresheetExtraction } from './useEventScoresheetExtraction';
import { isScoresheetPending, useEventScoresheetStatus } from './useEventScoresheetStatus';
import { useEventScoresheetUpload } from './useEventScoresheetUpload';
import { Text } from '@basketeasy/ui/text';

// Must match the allowlist EventsService.getScoresheetUploadUrl enforces
// server-side — kept in sync by hand since it's four literal strings, not
// worth a shared-types constant for. A scoresheet capture may be a PDF
// export (some e-Marque flows produce one) as well as a photo.
const ACCEPTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// One-off icons, only used within this file. No dedicated "take a photo"
// icon/control — no browser exposes real camera capture on desktop, and in
// practice mobile browsers don't reliably trigger one either, so this is a
// plain file upload everywhere, sourced from whatever picker the OS offers
// (camera roll, files, cloud drive, or an actual camera where the device
// offers one from its own picker UI). UploadIcon reuses the same glyph
// PlayerImportUploadStep already uses for this exact "pick a file" moment.
function UploadIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <path d="M12 16V4M12 4 7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

// Failure glyph for the NEEDS analysis-failed state — same shape already
// used inline for the upload-transport failure banner, pulled out here so
// the analysis-failure card (a distinct case: the upload succeeded, the OCR
// job itself failed) can reuse it too.
function AlertCircleIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function ClockIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

// Generic document glyph for the PDF preview placeholder — a PDF can't be
// thumbnailed client-side without pulling in a rendering library, which
// would be overkill for "show what you're about to send."
function DocumentIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

function ScoresheetFileInput({
  inputRef,
  onFileSelected,
}: {
  inputRef: RefObject<HTMLInputElement>;
  onFileSelected: (file: File | undefined) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_CONTENT_TYPES.join(',')}
      className="sr-only"
      aria-label="Choisir un fichier de la feuille de match"
      onChange={(e) => {
        onFileSelected(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );
}

/**
 * Match detail page's Feuille de match tab (`Scoresheet.dc.html`) — capture
 * → preview → upload (direct to a presigned R2 URL) → queued, with a
 * persistent (not toast) failure card on any step's error, matching
 * `QueryError`'s existing pattern: a toast could vanish before someone back
 * at the gym has a chance to retry.
 *
 * Any rostered member may capture/replace the file (self-service, same as
 * RSVP) — a non-rostered viewer (e.g. a club admin with no player profile)
 * only ever sees the read-only status. The file itself is never displayed
 * or re-downloaded anywhere in this slice (no such route exists yet), so
 * there's deliberately no "voir le fichier" affordance once queued.
 */
export function MatchScoresheetTab({
  clubId,
  teamId,
  event,
  isRostered,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  isRostered: boolean;
  canManage: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const {
    data: status,
    isLoading: isLoadingStatus,
    isError: isStatusError,
    refetch: refetchStatus,
  } = useEventScoresheetStatus(clubId, teamId, event.id);
  const {
    mutate: upload,
    isPending,
    isError: isUploadError,
    error: uploadError,
    reset: resetUpload,
  } = useEventScoresheetUpload(clubId, teamId, event.id);
  const {
    data: extraction,
    isLoading: isLoadingExtraction,
    isError: isExtractionError,
    refetch: refetchExtraction,
  } = useEventScoresheetExtraction(clubId, teamId, event.id, {
    enabled: status ? !isScoresheetPending(status.status) : false,
  });

  // Revokes the previous object URL whenever a new file replaces it, and on
  // unmount — otherwise every selection leaks a blob URL for the page's
  // lifetime.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelected = (file: File | undefined) => {
    if (!file) return;
    resetUpload();
    setSelectedFile(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const handleRetake = () => {
    resetUpload();
    setSelectedFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  // On success the hook's own onSuccess has already written the confirmed
  // EventScoresheet into the status query's cache (see
  // useEventScoresheetUpload) — clearing the local selection here just lets
  // the render fall through to the status-driven queued frame below, using
  // that already-fresh cache rather than a second fetch.
  const handleSend = (file: File) => {
    upload(file, {
      onSuccess: () => {
        setSelectedFile(null);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      },
    });
  };

  if (isStatusError) {
    return <QueryError onRetry={() => refetchStatus()} />;
  }
  if (isLoadingStatus) {
    return <SkeletonList rows={3} variant="card" />;
  }

  // A locally staged file (capturing/previewing/retrying, including
  // "replace" over an already-queued file) always wins over the server's
  // status — otherwise the server's UPLOADED status would flash back over
  // an in-progress replace.
  if (selectedFile) {
    const isPdf = selectedFile.type === 'application/pdf';
    return (
      <Card variant="panel" className="flex max-w-sm flex-col gap-4 md:max-w-lg">
        {isUploadError && (
          <QueryError
            title="Échec de l'envoi"
            description={
              uploadError instanceof Error
                ? uploadError.message
                : 'Une erreur est survenue. Merci de réessayer.'
            }
            onRetry={() => handleSend(selectedFile)}
            isRetrying={isPending}
          />
        )}
        {isPdf ? (
          <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2.5 rounded-lg border border-border-strong bg-surface-2 p-6 text-center">
            <DocumentIcon tone="secondary" className="h-10 w-10" />
            <Text as="span" variant="label" size="sm" className="break-all">
              {selectedFile.name}
            </Text>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-strong bg-surface-2">
            <img
              src={previewUrl ?? undefined}
              alt="Aperçu de la feuille de match"
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
        )}
        {!isUploadError && (
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              className="flex-1"
              disabled={isPending}
              onClick={handleRetake}
            >
              Reprendre
            </Button>
            <Button className="flex-1" loading={isPending} onClick={() => handleSend(selectedFile)}>
              Envoyer
            </Button>
          </div>
        )}
      </Card>
    );
  }

  if (
    status?.status === 'UPLOADED' ||
    status?.status === 'QUEUED' ||
    status?.status === 'PROCESSING'
  ) {
    return (
      <Card
        variant="panel"
        className="flex max-w-sm flex-col items-center gap-3 text-center md:max-w-lg"
      >
        <Text
          as="span"
          variant="body"
          tone="inverse"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-success"
        >
          <Check className="h-6 w-6" />
        </Text>
        <h3 className="font-heading text-lg font-extrabold">
          {status.status === 'PROCESSING' ? 'Analyse en cours' : 'Fichier envoyé'}
        </h3>
        <Badge variant="soft" tone="structure" size="md" className="w-fit gap-1.5">
          <ClockIcon className="h-3.5 w-3.5" />
          {status.status === 'PROCESSING'
            ? "Analyse par l'IA en cours"
            : "En file d'attente pour analyse"}
        </Badge>
        <Text variant="meta" size="xs" className="leading-relaxed">
          Envoyé le {formatEventDate(status.uploadedAt)}. Nous vous préviendrons une fois
          l&apos;analyse terminée.
        </Text>
        {isRostered && (
          <>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              Remplacer le fichier
            </Button>
            <ScoresheetFileInput inputRef={fileInputRef} onFileSelected={handleFileSelected} />
          </>
        )}
      </Card>
    );
  }

  if (status?.status === 'FAILED') {
    if (isExtractionError) {
      return <QueryError onRetry={() => refetchExtraction()} />;
    }
    if (isLoadingExtraction) {
      return <SkeletonList rows={3} variant="card" />;
    }
    return (
      <Card
        variant="panel"
        className="flex max-w-sm flex-col items-center gap-3 text-center md:max-w-lg"
      >
        <Text
          as="span"
          variant="body"
          tone="danger"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-error-tint"
        >
          <AlertCircleIcon aria-hidden="true" className="h-6 w-6" />
        </Text>
        <h3 className="font-heading text-lg font-extrabold">L&apos;analyse a échoué</h3>
        {extraction?.failureReason && (
          <div className="w-full rounded-lg border border-error/40 bg-error-tint p-3 text-left">
            <Text variant="body" size="sm" tone="danger" className="leading-relaxed">
              {extraction.failureReason}
            </Text>
          </div>
        )}
        <Text variant="meta" size="xs" className="leading-relaxed">
          La photo originale reste archivée avec le match. Vous pouvez relancer l&apos;analyse en
          renvoyant le fichier.
        </Text>
        {isRostered && (
          <>
            <Button onClick={() => fileInputRef.current?.click()} className="w-full">
              Relancer l&apos;analyse
            </Button>
            <ScoresheetFileInput inputRef={fileInputRef} onFileSelected={handleFileSelected} />
          </>
        )}
      </Card>
    );
  }

  if (
    status?.status === 'PARSED' ||
    status?.status === 'NEEDS_REVIEW' ||
    status?.status === 'CONFIRMED'
  ) {
    if (isExtractionError) {
      return <QueryError onRetry={() => refetchExtraction()} />;
    }
    if (isLoadingExtraction) {
      return <SkeletonList rows={3} variant="card" />;
    }
    // A terminal status with no extraction row is an inconsistent read, not
    // a "still analysing" one — surface it as a retryable error instead of
    // a skeleton that never resolves.
    if (!extraction) {
      return <QueryError onRetry={() => refetchExtraction()} />;
    }
    return (
      <ScoresheetExtractionCard
        clubId={clubId}
        teamId={teamId}
        event={event}
        extraction={extraction}
        canManage={canManage}
      />
    );
  }

  if (!isRostered) {
    return (
      <EmptyState
        icon={<UploadIcon tone="secondary" className="h-8 w-8" />}
        title="Aucune feuille de match pour le moment"
        description="Un membre de l'effectif peut l'ajouter après la rencontre."
      />
    );
  }

  return (
    <Card variant="panel" className="flex max-w-sm flex-col gap-5 md:max-w-lg">
      <div className="flex flex-col items-center gap-3.5 rounded-lg border-2 border-dashed border-border-strong bg-surface-2 p-8 text-center">
        <Text
          as="span"
          variant="body"
          tone="structure"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-green-tint"
        >
          <UploadIcon className="h-7 w-7" />
        </Text>
        <Text as="span" variant="label" size="sm" className="font-bold">
          Ajoutez la feuille de marque
        </Text>
        <Text as="span" variant="meta" size="xs" className="leading-relaxed">
          Photo ou PDF de la feuille e-Marque.
        </Text>
      </div>
      <Button onClick={() => fileInputRef.current?.click()}>
        <UploadIcon className="h-4 w-4" />
        Choisir un fichier
      </Button>
      <Text as="span" variant="meta" size="xs" className="leading-relaxed">
        Une IA lit automatiquement le score et les statistiques une fois le fichier envoyé.
      </Text>
      <ScoresheetFileInput inputRef={fileInputRef} onFileSelected={handleFileSelected} />
    </Card>
  );
}
