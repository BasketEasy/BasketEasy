import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const iconBadgeVariants = cva('inline-flex shrink-0 items-center justify-center rounded-full', {
  variants: {
    tone: {
      structure: 'bg-blue-green-tint text-blue-green',
      danger: 'bg-error-tint text-error',
      accent: 'bg-gold-tint text-gold-text',
    },
    size: {
      md: 'h-10 w-10',
      lg: 'h-14 w-14',
    },
  },
  defaultVariants: { tone: 'structure', size: 'md' },
});

export interface IconBadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof iconBadgeVariants> {}

/**
 * The tinted circle an icon sits in at the head of a row or an empty state.
 * It owns both the tint and the icon colour through `tone`, so a call site
 * never pairs a `bg-*-tint` with a matching text colour by hand. The icon
 * inside inherits the colour. `size` is `md` (40px, default) or `lg` (56px, error screens and
 * upload drop zones); a one-off smaller badge still sizes caller-side.
 */
export const IconBadge = forwardRef<HTMLSpanElement, IconBadgeProps>(
  ({ tone, size, className, ...props }, ref) => (
    <span ref={ref} className={cn(iconBadgeVariants({ tone, size }), className)} {...props} />
  ),
);
IconBadge.displayName = 'IconBadge';
