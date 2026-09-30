import { type ReactNode, forwardRef, type ElementRef } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Card } from './Card';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { sectionHeadingText } from './SectionHeading';
import { Text } from './Text';

/**
 * A stack of collapsible page sections — the manager's match page, where most
 * visits need two of seven blocks. Always `multiple` and controlled: the page
 * seeds the open set from an incoming deep link and owns it, nothing is
 * written back to the URL or to storage.
 *
 * Radix is imported here and nowhere else (the `chart` / `template-editor`
 * pattern); its keyboard model and `aria-expanded` / `aria-controls` come with
 * it. Closed content is unmounted, so a closed section runs none of its queries.
 */
export function SectionAccordion({
  value,
  onValueChange,
  children,
}: {
  value: string[];
  onValueChange: (value: string[]) => void;
  children: ReactNode;
}) {
  return (
    <Accordion.Root
      type="multiple"
      value={value}
      onValueChange={onValueChange}
      className="flex flex-col gap-2.5"
    >
      {children}
    </Accordion.Root>
  );
}

export const SectionAccordionItem = forwardRef<
  ElementRef<typeof Card>,
  {
    value: string;
    /** The DOM id an anchor scrolls to; present whether the item is open or not. */
    id?: string;
    title: string;
    /** One line shown in the trigger; omit when the page holds no fact for it. */
    summary?: ReactNode;
    /** Spoken instead of `summary` when the visual is terse (« 8 / 12 »). */
    summaryLabel?: string;
    /** Layout only (a scroll margin). */
    className?: string;
    children: ReactNode;
  }
>(({ value, id, title, summary, summaryLabel, className, children }, ref) => (
  <Accordion.Item value={value} asChild>
    <Card ref={ref} id={id} variant="flush" className={className}>
      <Accordion.Header asChild>
        <h2 className="m-0">
          <Accordion.Trigger
            className={cn(
              'group flex min-h-14 w-full items-center gap-3 px-4 text-left',
              focusRing,
            )}
          >
            <span className={cn('flex-1 whitespace-nowrap', sectionHeadingText)}>{title}</span>
            {summary && (
              <>
                <Text
                  as="span"
                  variant="meta"
                  className="min-w-0 truncate"
                  aria-hidden={summaryLabel ? true : undefined}
                >
                  {summary}
                </Text>
                {summaryLabel && <span className="sr-only">{summaryLabel}</span>}
              </>
            )}
            <ChevronDownIcon
              tone="secondary"
              aria-hidden="true"
              className="h-5 w-5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
          </Accordion.Trigger>
        </h2>
      </Accordion.Header>
      <Accordion.Content className="px-4 pb-4">{children}</Accordion.Content>
    </Card>
  </Accordion.Item>
));
SectionAccordionItem.displayName = 'SectionAccordionItem';
