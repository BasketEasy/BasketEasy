import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-base text-charcoal placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
      focusRing,
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
