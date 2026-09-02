import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * `variant` is the step on the surface ladder — four values, the only four
 * permutations that actually occur. `tone` (below) is the second axis.
 *
 * Padding is deliberately coupled to the variant rather than split into its
 * own prop: every `inset` in the app is p-3, every `panel` is p-5, and
 * `raised`/`flush` delegate their padding to CardHeader/CardContent. A
 * separate `padding` axis would offer 12 combinations to express 4 real ones.
 *
 * `inset` exists because of the surface ladder: a card nested inside an
 * already-raised container has to step *down* to surface-2, or it shares a
 * background with its parent. Ten call sites hand-wrote `bg-surface-2 p-3`
 * before this variant existed.
 */
const cardVariants = cva('rounded-lg border border-border', {
  variants: {
    variant: {
      raised: 'bg-surface shadow-sm',
      inset: 'bg-surface-2 p-3 shadow-sm',
      panel: 'bg-surface p-5 shadow-md',
      flush: 'overflow-hidden bg-surface shadow-sm',
    },
    /**
     * Meaning, not fill — the second axis, added for the one card that has
     * to read as *the* thing on the screen: the event page's decision band,
     * where a convoked player answers. Orange is the direction's rare, sharp
     * accent, so `brand` stays rare by construction: it is a tone a card
     * opts into, never a tint a call site paints on with `bg-orange-tint`.
     *
     * Declared after `variant` on purpose. cva emits variant classes in
     * declaration order and `cn` (tailwind-merge) keeps the last of two
     * conflicting utilities, so a tone's background wins over the variant's.
     */
    tone: {
      neutral: '',
      brand: 'border-orange/40 bg-orange-tint',
    },
  },
  defaultVariants: { variant: 'raised', tone: 'neutral' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, tone, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, tone }), className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-heading text-xl font-bold leading-none text-charcoal', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

/**
 * `pt-0` assumes a CardHeader sits above. When CardContent is the only child
 * it has to restore its own top padding — eleven call sites were passing
 * `pt-6` by hand to undo the `pt-0`. `first:pt-6` does it for them.
 */
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0 first:pt-6', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export { cardVariants };
