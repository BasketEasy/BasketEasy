import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const alertVariants = cva('relative w-full rounded-lg border p-4', {
  variants: {
    variant: {
      default: 'border-border bg-cream text-charcoal',
      destructive: 'border-error bg-error/10 text-error',
      /** Something the reader should act on that isn't an error (matches left without a venue). */
      warning: 'border-gold bg-gold-tint text-charcoal',
      /**
       * A full-bleed banner for a standing state that must never read as
       * product chrome (read-only impersonation): solid fill, edge to edge.
       */
      critical:
        'rounded-none border-x-0 border-t-0 border-error bg-error px-4 py-2 text-cream md:px-8',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';
