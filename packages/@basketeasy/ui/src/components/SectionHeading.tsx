import { type ReactNode, type Ref } from 'react';
import { cn } from '../lib/cn';

/** The court-line heading's type, shared with `SectionAccordion`'s trigger so the two can't drift. */
export const sectionHeadingText =
  'font-heading text-lg font-bold uppercase tracking-section text-blue-green';

export function SectionHeading({
  as: Tag = 'h3',
  count,
  children,
  className,
  headingRef,
}: {
  as?: 'h2' | 'h3';
  count?: number;
  children: ReactNode;
  className?: string;
  /** Makes the heading a programmatic focus target (`tabIndex={-1}`), for a flow that moves focus to its step title. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <Tag
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className={cn('m-0', sectionHeadingText, headingRef && 'outline-none')}
      >
        {children}
        {count !== undefined && ` (${count})`}
      </Tag>
      {/* Court line: the direction's structural motif, blue-green at low
          opacity so it reads as a rule rather than a divider. */}
      <span aria-hidden="true" className="h-0.5 flex-grow rounded-sm bg-blue-green/20" />
    </div>
  );
}
