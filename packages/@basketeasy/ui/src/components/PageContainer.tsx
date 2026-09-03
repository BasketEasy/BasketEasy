import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

// w-full + min-w-0: ProtectedRoute wraps the routed <main> in a flex column
// (for the sticky bottom tab bar), making this a flex item for the first
// time. mx-auto (used to center the max-w-6xl page on desktop) is a
// cross-axis auto margin, which opts a flex item out of the default stretch
// alignment — without an explicit w-full, this element sized itself to its
// own max-content width instead of the viewport's, and a wide unwrapped row
// (e.g. TeamDetailPage's five-tab TabsList) pushed the whole page hundreds
// of px past the viewport, which is what forces mobile Safari/Chrome to
// zoom the entire page out rather than letting that one row scroll. min-w-0
// then lets it actually shrink to that full width instead of refusing to
// go below its content's intrinsic size.
const pageContainerVariants = cva(
  'mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16',
  {
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
  },
);

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
