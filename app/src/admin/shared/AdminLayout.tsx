import type { ReactNode } from 'react';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Pagination } from '@basketeasy/ui/pagination';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { AdminLink } from './AdminLinks';

// Page-level building blocks shared by every back-office screen: the header
// with its breadcrumb, a labelled fact list, a titled section, and the list
// footer. See the validated canvas linked from
// docs/superpowers/specs/2026-09-28-backoffice-v2-part2-browse-ui.md.

export function AdminPageHeader({
  title,
  parent,
  subtitle,
  badges,
  actions,
}: {
  title: string;
  parent?: { to: string; label: string };
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {parent && (
        <nav aria-label="Fil d’Ariane" className="flex items-center gap-1.5">
          <AdminLink to={parent.to}>{parent.label}</AdminLink>
          <Text as="span" variant="meta" size="sm" aria-hidden="true">
            /
          </Text>
          <Text as="span" variant="meta" size="sm">
            {title}
          </Text>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2.5">
          <Heading as="h1" className="m-0 break-words">
            {title}
          </Heading>
          {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
          {subtitle && (
            <Text variant="meta" size="sm">
              {subtitle}
            </Text>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
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
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">{item.primary}</div>
              {item.secondary && (
                <Text as="span" variant="meta" size="sm">
                  {item.secondary}
                </Text>
              )}
            </div>
            {item.trailing && (
              <div className="flex flex-wrap items-center gap-2">{item.trailing}</div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A count at the top of a record page. */
export function AdminStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card variant="panel" className="flex flex-col gap-1">
      <Text as="span" variant="eyebrow" size="xs" tone="secondary">
        {label}
      </Text>
      <Text as="span" variant="display" size="3xl" className="tabular">
        {value}
      </Text>
    </Card>
  );
}

export function AdminStats({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}
