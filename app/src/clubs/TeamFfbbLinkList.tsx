import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { toast } from '@basketeasy/ui/toast-store';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { cn } from '@basketeasy/ui/cn';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { FfbbImportResult } from '@basketeasy/types/ffbb';
import { useTeamFfbbLinks } from './useTeamFfbbLinks';
import { useFfbbLinkAdd } from './useFfbbLinkAdd';
import { useFfbbLinkRemove } from './useFfbbLinkRemove';
import { useFfbbImport } from './useFfbbImport';
import { FfbbLinkField } from './FfbbLinkField';
import { FfbbMissingVenueAlert } from './FfbbMissingVenueAlert';
import { isFfbbLinkError } from './ffbbLinkErrors';
import { getClubErrorMessage } from './clubErrorMessages';
import { Text } from '@basketeasy/ui/text';

const MISSING_LABEL_FALLBACK = 'Compétition liée';

function importResultToast(result: FfbbImportResult) {
  if (result.created === 0 && result.updated === 0) {
    toast({
      variant: 'success',
      title: 'Calendrier à jour',
      description: 'Aucun changement — tous les matchs étaient déjà importés.',
    });
    return;
  }
  toast({
    variant: 'success',
    title: 'Calendrier importé',
    description: `${result.created} créés, ${result.updated} mis à jour, ${result.unchanged} inchangés.`,
  });
}

/**
 * "Compétitions FFBB liées" — the team-detail section from
 * docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md: chips +
 * an add row (sharing FfbbLinkField's copy with TeamCreateForm) + the
 * import button, all in one component since they're all driven by the same
 * link list. Renders nothing when there's nothing to see and nothing to do
 * (no links, and the viewer can't manage the team). No heading of its own: it
 * is the content of the team page's FFBB accordion item.
 */
export function TeamFfbbLinkList({
  clubId,
  teamId,
  canManage,
}: {
  clubId: string;
  teamId: string;
  canManage: boolean;
}) {
  const { data: links } = useTeamFfbbLinks(clubId, teamId);
  const { mutate: addLink, isPending: isAdding } = useFfbbLinkAdd(clubId, teamId);
  const { mutate: removeLink } = useFfbbLinkRemove(clubId, teamId);
  const {
    mutate: importSchedule,
    isPending: isImporting,
    data: importResult,
  } = useFfbbImport(clubId, teamId);
  const [newUrl, setNewUrl] = useState('');
  const [addError, setAddError] = useState<string | undefined>();
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (!links || (links.length === 0 && !canManage)) {
    return null;
  }

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setAddError(undefined);
    addLink(
      { ffbbTeamUrl: trimmed },
      {
        onSuccess: () => setNewUrl(''),
        onError: (err) => {
          if (isFfbbLinkError(err)) {
            setAddError(err.message);
            return;
          }
          toast({ variant: 'destructive', description: getClubErrorMessage(err) });
        },
      },
    );
  };

  const handleRemove = (linkId: string) => {
    setRemovingId(linkId);
    removeLink(linkId, {
      onSettled: () => setRemovingId(null),
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });
  };

  const handleImport = () => {
    importSchedule(undefined, {
      onSuccess: importResultToast,
      onError: (err) =>
        toast({ variant: 'destructive', title: "Échec de l'import", description: err.message }),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {canManage && links.length > 0 && (
        <Button
          variant="secondary"
          loading={isImporting}
          onClick={handleImport}
          className="self-start"
        >
          Importer le calendrier FFBB
        </Button>
      )}

      {links.length === 0 ? (
        <Text variant="meta">Aucune compétition FFBB liée pour l&apos;instant.</Text>
      ) : (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const label = link.ffbbEngagementLabel ?? MISSING_LABEL_FALLBACK;
            return (
              <Text
                as="span"
                variant="body"
                size="sm"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-1.5 shadow-sm"
                key={link.id}
              >
                <TrophyIcon tone="structure" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {label}
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Retirer le lien vers « ${label} »`}
                    disabled={removingId === link.id}
                    onClick={() => handleRemove(link.id)}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunk text-xs leading-none text-muted transition-colors hover:bg-error-tint hover:text-error disabled:cursor-not-allowed disabled:opacity-50',
                      focusRing,
                    )}
                  >
                    ×
                  </button>
                )}
              </Text>
            );
          })}
        </div>
      )}

      {importResult && (
        <FfbbMissingVenueAlert clubId={clubId} teamId={teamId} result={importResult} />
      )}

      {canManage && (
        <div className="max-w-md">
          <FfbbLinkField
            id="team-ffbb-link-add"
            value={newUrl}
            onChange={setNewUrl}
            error={addError}
            pending={isAdding}
            action={
              <Button variant="outline" loading={isAdding} onClick={handleAdd} className="shrink-0">
                Ajouter
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
