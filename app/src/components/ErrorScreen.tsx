import type { ReactNode } from 'react';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { IconBadge } from '@basketeasy/ui/icon-badge';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Text } from '@basketeasy/ui/text';

interface ErrorScreenProps {
  /** « Erreur 404 »: the code the reader can quote to support. */
  eyebrow: string;
  title: string;
  description: string;
  /** A node, not a link: the error boundary renders outside the router. */
  action: ReactNode;
}

/** The one shape of a dead end: 404, 403 and a render crash. */
export function ErrorScreen({ eyebrow, title, description, action }: ErrorScreenProps) {
  return (
    <PageContainer size="md" centered>
      <Card className="flex flex-col items-center gap-5 p-6 text-center">
        <IconBadge tone="accent" size="lg">
          <WarningIcon size="2xl" aria-hidden="true" />
        </IconBadge>
        <Text variant="eyebrow">{eyebrow}</Text>
        <Heading as="h1">{title}</Heading>
        <Text variant="meta">{description}</Text>
        {action}
      </Card>
    </PageContainer>
  );
}
