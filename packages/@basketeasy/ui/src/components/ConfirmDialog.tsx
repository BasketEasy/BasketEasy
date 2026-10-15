import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from './Alert';
import { Button } from './Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';
import { FormField } from './FormField';

export interface ConfirmDialogProps {
  /** Element that opens the dialog, wrapped in a DialogTrigger via asChild. */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact string (compared after trimming) into a labeled text field — the
   * type-to-confirm pattern for irreversible actions. Omit for a plain
   * confirm/cancel dialog with no typed gate.
   */
  confirmWord?: string;
  onConfirm: () => void;
  isPending?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmWord,
  onConfirm,
  isPending = false,
  error,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = confirmWord === undefined || typed.trim() === confirmWord;

  // Whenever the dialog transitions to closed — via Annuler, the X button,
  // Escape, an overlay click, or a controlled caller flipping `open` to
  // false after a successful onConfirm — clear the typed confirmation too.
  // Otherwise a user who types the confirm word, cancels, and reopens finds
  // the confirm button already enabled, defeating the type-to-confirm gate.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTyped('');
    }
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {confirmWord !== undefined && (
            <FormField
              label={`Saisissez « ${confirmWord} » pour confirmer`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!canConfirm}
              loading={isPending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
