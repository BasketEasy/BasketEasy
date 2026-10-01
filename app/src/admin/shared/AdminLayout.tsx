import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { ChevronLeftIcon } from '@basketeasy/ui/icons/chevron-left';
import { List, ListItem } from '@basketeasy/ui/list';
import { PageHeader } from '@basketeasy/ui/page-header';
import { PageHero } from '@basketeasy/ui/page-hero';
import { Pagination } from '@basketeasy/ui/pagination';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';

// Page-level building blocks shared by every back-office screen: the header
// with its breadcrumb, a labelled fact list, a titled section, and the list
// footer. See the validated canvas linked from
// docs/superpowers/specs/2026-09-28-backoffice-v2-part2-browse-ui.md.

/**
 * The page's title block, in the product's two shapes. With an `eyebrow` (the
 * entity kind) it is an entity page's `PageHero`, the stats block as its
 * `aside`; without, a collection's `PageHeader`. The breadcrumb stays above
 * either: the back-office has no `PageBar`, and the link stays visible on a
 * phone, where the shell is usable but not designed for.
 */
export function AdminPageHeader({
  title,
  parent,
  eyebrow,
  subtitle,
  badges,
  actions,
  aside,
}: {
  title: string;
  parent?: { to: string; label: string };
  /** The entity kind (« Club », « Joueur »…): switches the header to the hero. */
  eyebrow?: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {parent && (
        <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-1">
          <Button asChild variant="ghost" className="self-start">
            <Link to={parent.to}>
              <ChevronLeftIcon size="md" />
              {parent.label}
            </Link>
          </Button>
          <Text as="span" variant="meta" size="sm" aria-current="page">
            {title}
          </Text>
        </nav>
      )}
      {eyebrow ? (
        <PageHero
          badges={badges}
          eyebrow={eyebrow}
          title={title}
          titleAction={actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          meta={subtitle}
          aside={aside}
        />
      ) : (
        <PageHeader title={title} meta={subtitle} actions={actions} />
      )}
    </div>
  );
}

export function AdminSection({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <SectionHeading as="h2" count={count}>
        {title}
      </SectionHeading>
      {description && (
        <Text variant="meta" size="sm">
          {description}
        </Text>
      )}
      {children}
    </section>
  );
}

export function AdminFacts({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  return (
    <Card variant="panel" className="flex flex-col divide-y divide-border">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
          <Text as="span" variant="eyebrow" size="xs" tone="secondary">
            {fact.label}
          </Text>
          <div className="min-w-0 break-words">{fact.value}</div>
        </div>
      ))}
    </Card>
  );
}

/**
 * A list of records: a table inside a flush card on desktop, a stack of
 * cards below it. Each record branches on `useTableLayout()` itself, so the
 * stack is left unwrapped — a card of cards would put a surface on its own
 * surface.
 */
export function AdminTable({
  columns,
  children,
}: {
  columns: ReadonlyArray<ReactNode>;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktopViewport();
  const table = <ResponsiveTable columns={columns}>{children}</ResponsiveTable>;
  return isDesktop ? <Card variant="flush">{table}</Card> : table;
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />;
}

/** Main column plus a narrower aside on desktop; stacked on a phone. */
export function AdminTwoColumn({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4">{aside}</aside>
    </div>
  );
}

export interface AdminLinkedItem {
  key: string;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
}

/**
 * The records linked to the one on screen (a user's clubs, a team's
 * managers…): one row each, a link first, context after. A list rather than
 * a table because each section has two or three facts per row and must read
 * the same on a phone.
 */
export function AdminLinkedList({ items, empty }: { items: AdminLinkedItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <Text variant="meta" size="sm">
        {empty}
      </Text>
    );
  }
  return (
    <Card variant="flush">
      <List>
        {items.map((item) => (
          <ListItem key={item.key} wrap meta={item.secondary} trailing={item.trailing}>
            <span className="flex flex-wrap items-center gap-2">{item.primary}</span>
          </ListItem>
        ))}
      </List>
    </Card>
  );
}

/** The counts of a record page: a 2×2 grid of small tiles, the hero's `aside`. */
export function AdminStats({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
