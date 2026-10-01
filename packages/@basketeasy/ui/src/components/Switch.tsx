import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

/**
 * An immediate, persisted on/off setting: flipping it is the whole action, no
 * submit step follows. A value that is submitted later with a form is a
 * `Checkbox`. Radix owns `role="switch"`, `aria-checked`, Space/Enter and the
 * form-friendly hidden input; the track and thumb colours are the preset's.
 */
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-border-strong p-switch-inset transition-colors data-[state=checked]:bg-blue-green disabled:cursor-not-allowed disabled:opacity-50',
      focusRing,
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-switch-thumb w-switch-thumb rounded-full bg-surface transition-transform data-[state=checked]:translate-x-switch-travel" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
