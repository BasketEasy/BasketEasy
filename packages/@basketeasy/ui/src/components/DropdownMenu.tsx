import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

export const DropdownMenu = DropdownMenuPrimitive.Root;

export const DropdownMenuTrigger = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger ref={ref} className={cn(focusRing, className)} {...props} />
));
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      // collisionPadding keeps the menu (and the available-width it is
      // capped to) off the viewport edges instead of running flush to them
      // on a 320px screen.
      collisionPadding={collisionPadding}
      className={cn(
        // max-w-menu-available caps the menu at the space Radix measured on
        // the side it placed the content, so it can never run off the
        // viewport; min-w-menu stays the floor on a roomy screen.
        'z-50 min-w-menu max-w-menu-available rounded-md border border-border bg-surface p-1 shadow-lg',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('break-words px-3 py-2 text-xs font-medium uppercase text-muted', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-11 min-w-0 cursor-default select-none items-center gap-2 break-words rounded-sm px-3 py-2 text-sm text-charcoal outline-none data-[highlighted]:bg-orange-text data-[highlighted]:text-cream md:min-h-9',
      focusRing,
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('my-1 h-px bg-border', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
