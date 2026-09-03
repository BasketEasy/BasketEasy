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
      // dvh, not vh: on mobile Safari 100vh includes the area hidden behind
      // the collapsible address bar, so a centered page can end up taller
      // than the actually-visible viewport — the same class of bug
      // Dialog's own max-h-[calc(100dvh-2rem)] exists to avoid.
      true: 'min-h-dvh justify-center',
      false: '',
    },
  },
  defaultVariants: { size: 'lg', centered: false },
});

export interface PageContainerProps
  extends HTMLAttributes<HTMLElement>, VariantProps<typeof pageContainerVariants> {}

export const PageContainer = forwardRef<HTMLElement, PageContainerProps>(
  ({ className, size, centered, ...props }, ref) => (
    <main
      ref={ref}
      id="contenu"
      className={cn(pageContainerVariants({ size, centered }), className)}
      {...props}
    />
  ),
);
PageContainer.displayName = 'PageContainer';
