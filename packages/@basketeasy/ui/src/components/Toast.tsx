import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

export const ToastProvider = ToastPrimitive.Provider;

/**
 * The viewport is always mounted, empty or not, and it is a full-width box
 * pinned to the same bottom strip the app's fixed tab bar occupies — at a
 * higher z-index. Two rules keep it from eating taps meant for the bar:
 *
 * - `pointer-events-none` here, re-enabled per toast on `Toast` itself, so
 *   the empty box is transparent to touches instead of swallowing the lower
 *   part of every tab item.
 * - `max-md:bottom-24` lifts a *visible* toast clear of the bar below the
 *   desktop breakpoint — the same 96px `PageContainer`'s `bottomNav`
 *   clearance reserves, so a toast never covers the navigation it may be
 *   telling the reader about.
 */
export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'pointer-events-none fixed bottom-0 right-0 z-50 flex w-full max-w-sm flex-col gap-2 p-6',
      'max-md:bottom-24',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

const toastVariants = cva(
  // `pointer-events-auto` restores what the viewport turns off: the toast
  // itself is interactive (it carries a close button), the empty box it
  // floats in is not.
  'pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg',
  {
    variants: {
      variant: {
        success: 'border-success bg-success/10 text-success',
        destructive: 'border-error bg-error/10 text-error',
      },
    },
    defaultVariants: { variant: 'success' },
  },
);

export interface ToastProps
  extends
    ComponentPropsWithoutRef<typeof ToastPrimitive.Root>,
    VariantProps<typeof toastVariants> {}

export const Toast = forwardRef<ElementRef<typeof ToastPrimitive.Root>, ToastProps>(
  ({ className, variant, ...props }, ref) => (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  ),
);
Toast.displayName = 'Toast';

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn('font-heading text-sm font-bold leading-none', className)}
    {...props}
  />
));
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn('text-sm', className)} {...props} />
));
ToastDescription.displayName = 'ToastDescription';

export const ToastClose = forwardRef<
  ElementRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    aria-label="Fermer"
    className={cn(
      '-mr-2 -mt-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center text-lg text-current/60 hover:text-current',
      focusRing,
      className,
    )}
    {...props}
  >
    ×
  </ToastPrimitive.Close>
));
ToastClose.displayName = 'ToastClose';
