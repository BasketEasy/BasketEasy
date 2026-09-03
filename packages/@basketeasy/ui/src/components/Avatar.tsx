import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * The fallback's fill is a tone, not a caller-side colour. `structure` is the
 * default because an avatar is one of the blue-green structural accents;
 * `brand` marks a coach; `placeholder` is the dashed outline used where the
 * person is unknown (an opponent team with no roster).
 */
/**
 * Size pairs the circle with its initials, because the two always co-vary.
 * Four call sites used to put `text-xs` on the root next to `h-7 w-7`, which
 * did nothing: the fallback hardcoded its own `text-sm`, and a child's class
 * beats an inherited one. The fallback now inherits, so the intent lands.
 */
const avatarVariants = cva('relative flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      sm: 'h-7 w-7 text-xs',
      md: 'h-8 w-8 text-xs',
      lg: 'h-10 w-10 text-sm',
    },
  },
  defaultVariants: { size: 'lg' },
});

export interface AvatarProps
  extends
    ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

const avatarFallbackVariants = cva(
  'flex h-full w-full items-center justify-center rounded-full font-medium',
  {
    variants: {
      tone: {
        structure: 'bg-blue-green text-cream',
        brand: 'bg-orange text-cream',
        placeholder: 'border-2 border-dashed border-border-strong bg-sunk text-muted',
        /**
         * A count rather than a person — AvatarGroup's "+N" overflow chip.
         * Not `placeholder`: its dashed outline means "we don't know who
         * this is", which is the opposite of what the chip says.
         */
        muted: 'bg-sunk text-muted',
        /** For an avatar sitting on a brand-filled surface, where the fill inverts. */
        inverse: 'bg-surface-2 text-orange-text',
      },
    },
    defaultVariants: { tone: 'structure' },
  },
);

export interface AvatarFallbackProps
  extends
    ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>,
    VariantProps<typeof avatarFallbackVariants> {}

export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, size, ...props }, ref) => (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(avatarVariants({ size }), className)}
      {...props}
    />
  ),
);
Avatar.displayName = 'Avatar';

export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackProps
>(({ className, tone, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(avatarFallbackVariants({ tone }), className)}
    {...props}
  />
));
AvatarFallback.displayName = 'AvatarFallback';
