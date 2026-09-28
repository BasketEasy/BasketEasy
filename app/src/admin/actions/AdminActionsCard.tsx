import type { ReactNode } from 'react';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';

/**
 * « Actions support » on a record page: only the actions that apply to the
 * record's current state, each a title, a line of context and its trigger.
 */
export function AdminActionsCard({ children }: { children: ReactNode }) {
  return (
    <Card variant="panel" className="flex flex-col gap-3">
      <SectionHeading as="h2">Actions support</SectionHeading>
      <Text variant="meta" size="sm">
        Chaque action demande un motif et est journalisée.
      </Text>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">{children}</ul>
    </Card>
  );
}

export function AdminActionRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-40 flex-1 flex-col gap-0.5">
        <Text as="span" variant="label" size="sm">
          {title}
        </Text>
        {detail && (
          <Text as="span" variant="meta" size="xs">
            {detail}
          </Text>
        )}
      </div>
      {action}
    </li>
  );
}
