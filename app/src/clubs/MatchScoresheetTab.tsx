import { useEffect, useRef, useState, type RefObject, type SVGProps } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Check } from '@basketeasy/ui/icons/check';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDate } from './eventDateFormat';
import { useEventScoresheetStatus } from './useEventScoresheetStatus';
import { useEventScoresheetUpload } from './useEventScoresheetUpload';

// Must match the allowlist EventsService.getScoresheetUploadUrl enforces
// server-side — kept in sync by hand since it's three literal strings, not
// worth a shared-types constant for.
const ACCEPTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// One-off icons, only used within this file — Scoresheet.dc.html's exact
// paths, transcribed per the plan's pixel-fidelity rule.
function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ScoresheetFileInputs({
  cameraInputRef,
  galleryInputRef,
  onFileSelected,
}: {
  cameraInputRef: RefObject<HTMLInputElement>;
  galleryInputRef: RefObject<HTMLInputElement>;
  onFileSelected: (file: File | undefined) => void;
}) {
  return (
    <>
      {/* `capture="environment"` opens the rear camera directly on mobile;
          desktop browsers ignore it and fall back to a plain file picker,
          which is the "usable desktop fallback" the spec calls for. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPTED_CONTENT_TYPES.join(',')}
        capture="environment"
        className="sr-only"
        aria-label="Prendre une photo de la feuille de match"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPTED_CONTENT_TYPES.join(',')}
        className="sr-only"
        aria-label="Choisir une photo de la feuille de match dans la galerie"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

/**
 * Match detail page's Feuille de match tab (`Scoresheet.dc.html`) — capture
 * → preview → upload (direct to a presigned R2 URL) → queued, with a
 * persistent (not toast) failure card on any step's error, matching
 * `QueryError`'s existing pattern: a toast could vanish before someone back
 * at the gym has a chance to retry.
 *
 * Any rostered member may capture/replace the photo (self-service, same as
 * RSVP) — a non-rostered viewer (e.g. a club admin with no player profile)
 * only ever sees the read-only status. The photo itself is never displayed
 * or re-downloaded anywhere in this slice (no such route exists yet), so
 * there's deliberately no "voir la photo" affordance once queued.
 */
export function MatchScoresheetTab({
  clubId,
  teamId,
  event,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  isRostered: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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
  // "replace" over an already-queued photo) always wins over the server's
  // status — otherwise the server's UPLOADED status would flash back over
  // an in-progress replace.
  if (selectedFile) {
    return (
      <Card className="flex max-w-sm flex-col gap-4 p-5 shadow-md">
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
        <div className="overflow-hidden rounded-lg border border-border-strong bg-surface-2">
          <img
            src={previewUrl ?? undefined}
            alt="Aperçu de la feuille de match"
            className="aspect-[3/4] w-full object-cover"
          />
        </div>
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

  if (status?.status === 'UPLOADED') {
    return (
      <Card className="flex max-w-sm flex-col items-center gap-3 p-5 text-center shadow-md">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-cream">
          <Check className="h-6 w-6" />
        </span>
        <h3 className="font-heading text-lg font-extrabold">Photo envoyée</h3>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-green/30 bg-blue-green-tint px-3 py-1 text-xs font-bold text-blue-green">
          <ClockIcon className="h-3.5 w-3.5" />
          En file d&apos;attente pour analyse
        </span>
        <p className="text-xs leading-relaxed text-muted">
          Envoyée le {formatEventDate(status.uploadedAt)}. Nous vous préviendrons une fois
          l&apos;analyse terminée.
        </p>
        {isRostered && (
          <>
            <Button variant="ghost" size="sm" onClick={() => galleryInputRef.current?.click()}>
              Remplacer la photo
            </Button>
            <ScoresheetFileInputs
              cameraInputRef={cameraInputRef}
              galleryInputRef={galleryInputRef}
              onFileSelected={handleFileSelected}
            />
          </>
        )}
      </Card>
    );
  }

  if (!isRostered) {
    return (
      <EmptyState
        icon={<CameraIcon className="h-8 w-8 text-muted" />}
        title="Aucune feuille de match pour le moment"
        description="Un membre de l'effectif peut l'ajouter après la rencontre."
      />
    );
  }

  return (
    <Card className="flex max-w-sm flex-col gap-5 p-5 shadow-md">
      <div className="flex flex-col items-center gap-3.5 rounded-lg border-2 border-dashed border-border-strong bg-surface-2 p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-green-tint text-blue-green">
          <CameraIcon className="h-7 w-7" />
        </span>
        <span className="text-sm font-bold text-charcoal">Photographiez la feuille de marque</span>
        <span className="text-xs leading-relaxed text-muted">
          Cadrez la feuille e-Marque bien à plat, dans un endroit lumineux.
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button onClick={() => cameraInputRef.current?.click()}>
          <CameraIcon className="h-4 w-4" />
          Prendre une photo
        </Button>
        <Button variant="outline" onClick={() => galleryInputRef.current?.click()}>
          Choisir dans la galerie
        </Button>
      </div>
      <span className="text-xs leading-relaxed text-muted">
        L&apos;analyse automatique (IA) arrive bientôt. Pour l&apos;instant, la photo est simplement
        archivée avec le match.
      </span>
      <ScoresheetFileInputs
        cameraInputRef={cameraInputRef}
        galleryInputRef={galleryInputRef}
        onFileSelected={handleFileSelected}
      />
    </Card>
  );
}
