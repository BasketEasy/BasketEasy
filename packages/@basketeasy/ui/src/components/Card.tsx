import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * One axis, four values — the only four permutations that actually occur.
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
  },
  defaultVariants: { variant: 'raised' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
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

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { cardVariants };
