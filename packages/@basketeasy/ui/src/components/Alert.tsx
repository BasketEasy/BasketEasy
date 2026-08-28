import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const alertVariants = cva('relative w-full rounded-lg border p-4', {
  variants: {
    variant: {
      default: 'border-border bg-cream text-charcoal',
      destructive: 'border-error bg-error/10 text-error',
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
