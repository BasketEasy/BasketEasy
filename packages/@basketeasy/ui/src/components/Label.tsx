import { type LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium text-charcoal', className)} {...props} />
  ),
);
Label.displayName = 'Label';
