import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const pageContainerVariants = cva('mx-auto flex flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16', {
  variants: {
    size: {
      md: 'max-w-md',
      lg: 'max-w-6xl',
    },
    centered: {
      true: 'min-h-screen justify-center',
      false: '',
    },
    /**
     * Clearance for the app's fixed bottom tab bar, handled here once rather
     * than by every page that would otherwise have its last row covered.
     *
     * `max-md` is the exact complement of `DESKTOP_BREAKPOINT_PX`, where the
     * bar stops rendering — and it has to be a max-width variant rather than
     * a plain `pb-*`, because the base's `sm:py-16` would win back the bottom
     * padding between 640px and the breakpoint.
     */
    bottomNav: {
      true: 'max-md:pb-24',
      false: '',
    },
  },
  defaultVariants: { size: 'lg', centered: false, bottomNav: true },
});

export interface PageContainerProps
  extends HTMLAttributes<HTMLElement>, VariantProps<typeof pageContainerVariants> {}

export const PageContainer = forwardRef<HTMLElement, PageContainerProps>(
  ({ className, size, centered, bottomNav, ...props }, ref) => (
    <main
      ref={ref}
      id="contenu"
      className={cn(pageContainerVariants({ size, centered, bottomNav }), className)}
      {...props}
    />
  ),
);
PageContainer.displayName = 'PageContainer';
