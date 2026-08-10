import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from './icons/Check';
import { cn } from '../lib/cn';

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-5 w-5 shrink-0 rounded-sm border border-border ring-offset-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-orange data-[state=checked]:text-cream',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
