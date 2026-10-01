import type { ReactNode } from 'react';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { List, ListItem } from '@basketeasy/ui/list';
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
      <List variant="panel">{children}</List>
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
    <ListItem wrap meta={detail} trailing={action}>
      {title}
    </ListItem>
  );
}
