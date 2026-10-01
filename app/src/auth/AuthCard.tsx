import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';

interface AuthCardProps {
  /** Small line above the title: the tagline, or the club an invitation is for. */
  eyebrow?: string;
  /** The page's one `h1`. */
  title: string;
  description?: ReactNode;
  /** Under the card, centred: the way to the sibling screen. */
  footer?: ReactNode;
  /**
   * Makes the wordmark a link to `/`. Only the `PublicOnlyRoute` pages set it;
   * a page opened from an inbox (reset, verify, invitations) keeps it as plain
   * text so a visitor mid-recovery is not sent away.
   */
  brandLink?: boolean;
  children?: ReactNode;
}

/** The one layout of every signed-out screen: wordmark, titled card, footer. */
export function AuthCard({
  eyebrow,
  title,
  description,
  footer,
  brandLink = false,
  children,
}: AuthCardProps) {
  const wordmark = (
    <Text as="span" variant="display" size="2xl" tone="brand" className="text-center uppercase">
      Kluvo
    </Text>
  );
  return (
    <div className="flex flex-col gap-5">
      {brandLink ? (
        <Link to="/" aria-label="Kluvo" className="self-center no-underline">
          {wordmark}
        </Link>
      ) : (
        <div className="self-center">{wordmark}</div>
      )}
      <Card variant="panel" className="flex flex-col gap-4">
        {eyebrow && <Text variant="eyebrow">{eyebrow}</Text>}
        <Heading as="h1" size="3xl">
          {title}
        </Heading>
        {description && <Text variant="meta">{description}</Text>}
        {children}
      </Card>
      {footer && (
        <Text variant="meta" className="text-center">
          {footer}
        </Text>
      )}
    </div>
  );
}
