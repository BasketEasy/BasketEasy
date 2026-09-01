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

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
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
        'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg',
        className,
      )}
      {...props}
    >
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
    className={cn('font-heading text-xl font-bold text-charcoal', className)}
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
