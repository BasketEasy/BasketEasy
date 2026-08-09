import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

/** Inline error text under a row/field action, announced via role="alert". */
export const FieldError = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} role="alert" className={cn('text-sm text-error', className)} {...props} />
  ),
);
FieldError.displayName = 'FieldError';
