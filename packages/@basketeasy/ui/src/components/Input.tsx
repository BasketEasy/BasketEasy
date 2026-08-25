import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-charcoal placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
