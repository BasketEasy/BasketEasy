import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Two orthogonal axes: `variant` is the fill treatment, `tone` is the meaning.
 *
 * The old enum mixed the two — `default` meant "solid orange", `secondary`
 * meant "solid blue-green" — so a soft orange badge had nowhere to live and
 * five call sites hand-wrote the tint triad instead (the worst being
 * `badgeClassName()` in PlayerImportPreviewStep, a caller-side function
 * returning Tailwind colour classes).
 *
 * Tone names describe role, not colour: `brand` is the rare sharp accent
 * (orange), `structure` carries the blue-green that organises the UI. Nothing
 * here names a hue.
 */
const badgeVariants = cva('inline-flex items-center rounded-full text-xs', {
  variants: {
    /** Padding and weight together, so a call site never reaches for either. */
    size: {
      sm: 'px-2.5 py-0.5 font-semibold',
      md: 'px-3 py-1 font-bold',
    },
    variant: {
      solid: '',
      soft: 'border',
      outline: 'border',
    },
    tone: {
      brand: '',
      structure: '',
      neutral: '',
      muted: '',
      danger: '',
      accent: '',
      success: '',
    },
  },
  compoundVariants: [
    { variant: 'solid', tone: 'brand', class: 'bg-orange-text text-cream' },
    { variant: 'solid', tone: 'structure', class: 'bg-blue-green text-cream' },
    { variant: 'solid', tone: 'neutral', class: 'bg-charcoal text-cream' },
    { variant: 'solid', tone: 'muted', class: 'bg-muted text-cream' },
    { variant: 'solid', tone: 'danger', class: 'bg-error text-cream' },
    { variant: 'solid', tone: 'accent', class: 'bg-gold text-cream' },
    { variant: 'solid', tone: 'success', class: 'bg-success text-cream' },

    { variant: 'soft', tone: 'brand', class: 'border-orange/30 bg-orange-tint text-orange-text' },
    {
      variant: 'soft',
      tone: 'structure',
      class: 'border-blue-green/25 bg-blue-green-tint text-blue-green',
    },
    { variant: 'soft', tone: 'neutral', class: 'border-border bg-surface-2 text-charcoal' },
    { variant: 'soft', tone: 'muted', class: 'border-border bg-surface-2 text-muted' },
    { variant: 'soft', tone: 'danger', class: 'border-error bg-error-tint text-error' },
    { variant: 'soft', tone: 'accent', class: 'border-gold/35 bg-gold-tint text-gold-text' },
    {
      variant: 'soft',
      tone: 'success',
      class: 'border-success/30 bg-success/10 text-success-text',
    },

    { variant: 'outline', tone: 'brand', class: 'border-orange/40 text-orange-text' },
    { variant: 'outline', tone: 'structure', class: 'border-blue-green/40 text-blue-green' },
    { variant: 'outline', tone: 'neutral', class: 'border-border text-charcoal' },
    { variant: 'outline', tone: 'muted', class: 'border-border text-muted' },
    { variant: 'outline', tone: 'danger', class: 'border-error text-error' },
    { variant: 'outline', tone: 'accent', class: 'border-gold/40 text-gold-text' },
    { variant: 'outline', tone: 'success', class: 'border-success/40 text-success' },
  ],
  defaultVariants: { variant: 'soft', tone: 'brand', size: 'sm' },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, tone, size }), className)} {...props} />;
}

export { badgeVariants };
