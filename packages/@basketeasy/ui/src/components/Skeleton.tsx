import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-sunk', className)} {...props} />;
}

/**
 * A whole list's worth of placeholders at the real row height, so content
 * arriving does not shift the page. One role="status" for the group — not
 * one per row, which would announce N times.
 */
export function SkeletonList({
  rows = 3,
  variant = 'row',
  className,
}: {
  rows?: number;
  variant?: 'row' | 'card';
  className?: string;
}) {
  return (
    <div role="status" aria-label="Chargement…" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          data-testid="skeleton-row"
          className={cn(
            'flex items-center gap-3 rounded-md border border-border bg-surface p-3',
            variant === 'card' && 'h-[76px]',
          )}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-grow flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
