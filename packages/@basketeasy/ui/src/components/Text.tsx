import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * The one text primitive. Three orthogonal axes:
 *
 *   variant — the ROLE (family, weight, case, tracking)
 *   size    — the SCALE
 *   tone    — the semantic COLOUR
 *
 * Before this existed, 166 raw <p>/<span>/<div> elements carried 69 distinct
 * hand-written class recipes. The same slot — the bold name of a record on
 * the first line of a card — was written five different ways (font-medium,
 * text-sm font-medium, text-sm font-semibold, text-sm font-bold, font-bold),
 * with the weight drifting freely and no rule behind it. `label` is that slot.
 *
 * `tone` names roles, never hues: `secondary` not `muted-grey`, `inverse` not
 * `cream`. The one place a colour value is spelled out is the map below.
 */
const textVariants = cva('', {
  variants: {
    variant: {
      /** Plain running text. */
      body: '',
      /** The name of a record — the emphasized first line of a row or card. */
      label: 'font-semibold',
      /** Secondary/supporting information. Defaults to the `secondary` tone. */
      meta: '',
      /** Uppercase micro-label above a value or section. */
      eyebrow: 'font-heading font-bold uppercase tracking-eyebrow',
      /** Large non-heading emphasis: scores, counts, stat values. */
      display: 'font-heading font-extrabold',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
    },
    tone: {
      primary: 'text-charcoal',
      secondary: 'text-muted',
      inverse: 'text-cream',
      brand: 'text-orange-text',
      structure: 'text-blue-green',
      danger: 'text-error',
      success: 'text-success',
      accent: 'text-gold-text',
      /** Inherit from the parent — for text inside an already-coloured block. */
      inherit: '',
    },
  },
  defaultVariants: { variant: 'body', size: 'md', tone: 'primary' },
});

type TextElement = 'p' | 'span' | 'div' | 'dt' | 'dd' | 'li' | 'time' | 'strong';

/**
 * `meta` and `eyebrow` are secondary by definition, and `eyebrow` is always
 * small — so the common cases need no props beyond the variant.
 */
const DEFAULTS_BY_VARIANT: Record<
  NonNullable<VariantProps<typeof textVariants>['variant']>,
  {
    size: NonNullable<VariantProps<typeof textVariants>['size']>;
    tone: NonNullable<VariantProps<typeof textVariants>['tone']>;
  }
> = {
  body: { size: 'md', tone: 'primary' },
  label: { size: 'md', tone: 'primary' },
  meta: { size: 'sm', tone: 'secondary' },
  eyebrow: { size: 'xs', tone: 'secondary' },
  display: { size: 'xl', tone: 'primary' },
};

export interface TextProps
  extends Omit<HTMLAttributes<HTMLElement>, 'color'>, VariantProps<typeof textVariants> {
  as?: TextElement;
}

export const Text = forwardRef<HTMLElement, TextProps>(
  ({ as = 'p', variant, size, tone, className, ...props }, ref) => {
    const Tag = as as 'p';
    const defaults = DEFAULTS_BY_VARIANT[variant ?? 'body'];
    return (
      <Tag
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn(
          textVariants({ variant, size: size ?? defaults.size, tone: tone ?? defaults.tone }),
          className,
        )}
        {...props}
      />
    );
  },
);
Text.displayName = 'Text';

export { textVariants };
