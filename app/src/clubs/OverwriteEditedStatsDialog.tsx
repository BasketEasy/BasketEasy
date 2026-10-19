import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';

/**
 * Confirming a scoresheet replaces the match's stats with its reading, so
 * when a manager corrected them by hand since, the server refuses
 * (`STATS_EDITED`) until the overwrite is explicit. Its own step, not a line
 * in the sheet card: the action it gates throws that work away.
 */
export function OverwriteEditedStatsDialog({
  open,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Écraser vos modifications ?</DialogTitle>
          <DialogDescription>
            Les stats de ce match ont été corrigées à la main. Confirmer la feuille les remplace par
            sa lecture : le score, les quarts et les lignes des joueurs reviennent à ce que la
            feuille indique.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col-reverse gap-2.5 md:flex-row md:justify-end">
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
            Annuler
          </Button>
          <Button type="button" variant="destructive" loading={isPending} onClick={onConfirm}>
            Écraser les modifications
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
