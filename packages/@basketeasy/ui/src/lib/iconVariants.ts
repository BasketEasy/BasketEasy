import { cva, type VariantProps } from 'class-variance-authority';
import type { SVGProps } from 'react';

/**
 * The colour axis every icon shares.
 *
 * Icons paint with `currentColor`, so before this existed the only way to
 * colour one was a `text-*` class at the call site — 25 of them, naming raw
 * colours the caller had to know. `tone` names the role instead, exactly like
 * `Badge` and `Text`.
 *
 * `inherit` is the default and stays the common case: an icon inside a
 * coloured block (a Badge, a filled button, a muted row) should take its
 * parent's colour rather than restate it.
 *
 * Size deliberately has no variant here: dimensions are composition, which
 * the project's closed-prop-API rule leaves caller-side alongside `flex` and
 * `gap-*`. Only colour is closed.
 */
export const iconVariants = cva('', {
  variants: {
    tone: {
      inherit: '',
      primary: 'text-charcoal',
      secondary: 'text-muted',
      brand: 'text-orange-text',
      structure: 'text-blue-green',
      accent: 'text-gold',
      danger: 'text-error',
      success: 'text-success',
      inverse: 'text-cream',
    },
  },
  defaultVariants: { tone: 'inherit' },
});

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & VariantProps<typeof iconVariants>;
