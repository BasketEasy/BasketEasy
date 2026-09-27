import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export function SectionHeading({
  as: Tag = 'h3',
  count,
  children,
  className,
}: {
  as?: 'h2' | 'h3';
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <Tag className="m-0 font-heading text-lg font-bold uppercase tracking-section text-blue-green">
        {children}
        {count !== undefined && ` (${count})`}
      </Tag>
      {/* Court line: the direction's structural motif, blue-green at low
          opacity so it reads as a rule rather than a divider. */}
      <span aria-hidden="true" className="h-0.5 flex-grow rounded-sm bg-blue-green/20" />
    </div>
  );
}
