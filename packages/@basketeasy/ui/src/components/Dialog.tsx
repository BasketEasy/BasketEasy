import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  forwardRef,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// Where a dialog sits. `responsive` (the default) is a bottom sheet below `md`
// and the centred card from `md` up, the app's one mobile/desktop line. `sheet`
// stays a sheet at every width, for a picker (the persona switcher); `dialog`
// stays a centred card at every width, for a flow that must never cover the
// bottom edge (no caller today). One primitive with several placements, never
// a second modal component — focus trap, Escape and the close button come with
// all of them.
const DIALOG_PLACEMENT = {
  // max-h + overflow-y-auto keeps the dialog scrollable instead of
  // clipping its own content when the viewport is short — a phone in
  // landscape, or the on-screen keyboard eating into the visual
  // viewport. dvh (not vh) tracks that shrunk viewport so the cap
  // actually accounts for the keyboard, not just the layout viewport.
  //
  // Width is calc(100% - 2rem), not calc(100vw - 2rem): vw includes the
  // classic scrollbar, so a vw-sized dialog is scrollbar-width too wide
  // and pushes the page sideways. For a fixed-position box the
  // percentage resolves against the initial containing block, which
  // excludes the scrollbar.
  dialog:
    'left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border',
  responsive:
    'inset-x-0 bottom-0 w-full rounded-t-2xl border-t ' +
    'md:right-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-2rem)] md:max-w-md ' +
    'md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border',
  // Same height cap; full width at the bottom, only the top corners rounded.
  sheet: 'inset-x-0 bottom-0 w-full rounded-t-2xl border-t',
} as const;

type DialogPlacement = keyof typeof DIALOG_PLACEMENT;

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  variant?: DialogPlacement;
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, variant = 'responsive', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto border-border bg-surface p-6 shadow-lg',
        DIALOG_PLACEMENT[variant],
        className,
      )}
      {...props}
    >
      {variant !== 'dialog' && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-1/2 top-2 block h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong',
            variant === 'responsive' && 'md:hidden',
          )}
        />
      )}
      {children}
      <DialogPrimitive.Close
        aria-label="Fermer"
        className={cn(
          'absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-xl text-charcoal/60 hover:text-charcoal',
          focusRing,
        )}
      >
        ×
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // pr-10 (stacked on top of DialogContent's own p-6) keeps title/description
  // text clear of the close button's enlarged (44x44) tap target, which sits
  // closer to the corner than the content padding alone would suggest —
  // measured empirically against the app's longest dialog title at 320px.
  return <div className={cn('flex flex-col gap-1.5 pr-10', className)} {...props} />;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-heading text-3xl font-extrabold uppercase text-charcoal', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
