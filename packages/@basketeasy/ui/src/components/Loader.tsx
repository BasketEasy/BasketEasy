import { type HTMLAttributes, forwardRef } from 'react';
import { Spinner } from './icons/Spinner';
import { cn } from '../lib/cn';

/** Loading indicator with a spinner, announced via role="status"/aria-live. */
export const Loader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 text-sm text-muted', className)}
      {...props}
    >
      <Spinner size="md" className="animate-spin" />
      <span>{children}</span>
    </div>
  ),
);
Loader.displayName = 'Loader';
