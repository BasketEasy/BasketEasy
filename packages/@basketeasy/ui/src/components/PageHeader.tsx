import { type ReactNode, type Ref } from 'react';
import { Heading } from './Heading';
import { Text } from './Text';

/**
 * A tab root's title block: the `h1`, one meta line and at most one action,
 * with no card around it and no back control. A tab root is reached from the
 * bottom nav, so there is nowhere to go back to. Entity pages use `PageHero`.
 *
 * `meta` is a node so a caller can pass `tabular` content or a `Text` that
 * needs `break-all`; `titleRef` lets a flow move focus to its heading.
 */
export function PageHeader({
  title,
  meta,
  actions,
  titleRef,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-auto flex-col gap-1.5">
        <Heading ref={titleRef} as="h1" size="hero" className="m-0">
          {title}
        </Heading>
        {meta !== undefined && meta !== null && <Text variant="meta">{meta}</Text>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
