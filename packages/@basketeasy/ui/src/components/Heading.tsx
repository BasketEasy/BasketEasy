import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const headingVariants = cva('', {
  variants: {
    size: {
      '5xl': 'text-5xl',
      '4xl': 'text-4xl',
      '3xl': 'text-3xl',
      xl: 'text-xl',
    },
  },
});

export type HeadingLevel = 'h1' | 'h2' | 'h3';

const defaultSizeByLevel: Record<
  HeadingLevel,
  NonNullable<VariantProps<typeof headingVariants>['size']>
> = {
  h1: '4xl',
  h2: '3xl',
  h3: 'xl',
};

export interface HeadingProps
  extends HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  as?: HeadingLevel;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ as = 'h2', size, className, ...props }, ref) => {
    const Tag = as;
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ size: size ?? defaultSizeByLevel[as] }), className)}
        {...props}
      />
    );
  },
);
Heading.displayName = 'Heading';
