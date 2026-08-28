import { type ReactNode, createContext, useContext } from 'react';
import { cn } from '../lib/cn';
import { useIsDesktopViewport } from '../lib/useIsDesktopViewport';
import { Table, TableBody, TableHead, TableHeader, TableRow } from './Table';

/**
 * A table that becomes a stack of cards below the desktop breakpoint.
 *
 * The app had six of these built by hand, each as a *pair* of components — a
 * `…Row` rendering `TableCell`s and a `…Card` rendering a `Card` — and each
 * pair duplicated 75-90% of its file: the same mutation hook, the same error
 * branching, the same toast copy, the same button labels. `TeamAdminRow` and
 * `TeamAdminCard` were identical down to a mirrored code comment.
 *
 * The duplication was never in the *markup*, which genuinely differs between
 * a table row and a card. It was in everything around it. So the fix is not a
 * generic cell renderer that would flatten both layouts into one: it is to
 * let a record component be written once, keep its behaviour once, and choose
 * its own markup from `useTableLayout()`.
 *
 *   <ResponsiveTable columns={['E-mail', '']}>
 *     {admins.map((a) => <TeamAdminRow key={a.userId} admin={a} … />)}
 *   </ResponsiveTable>
 *
 * and inside that component:
 *
 *   return useTableLayout() === 'row'
 *     ? <TableRow>…</TableRow>
 *     : <Card variant="inset">…</Card>;
 */
export type TableLayout = 'row' | 'card';

const TableLayoutContext = createContext<TableLayout>('row');

/** The layout the nearest ResponsiveTable is currently rendering. */
export function useTableLayout(): TableLayout {
  return useContext(TableLayoutContext);
}

export interface ResponsiveTableProps {
  /**
   * Desktop header labels, in column order. Pass an empty string for a column
   * that holds actions and needs no heading — the header cell is still
   * rendered, so the column count stays right.
   */
  columns: ReadonlyArray<ReactNode>;
  /** One record component per row. Each reads `useTableLayout()`. */
  children: ReactNode;
  /** Gap between cards in the mobile stack. */
  className?: string;
}

export function ResponsiveTable({ columns, children, className }: ResponsiveTableProps) {
  const isDesktop = useIsDesktopViewport();

  if (!isDesktop) {
    return (
      <TableLayoutContext.Provider value="card">
        <div className={cn('flex flex-col gap-3', className)}>{children}</div>
      </TableLayoutContext.Provider>
    );
  }

  return (
    <TableLayoutContext.Provider value="row">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Header labels are static per call site, so the index is a
                stable key here; the alternative would be forcing every caller
                to invent ids for the empty action columns. */}
            {columns.map((label, index) => (
              <TableHead key={index}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </TableLayoutContext.Provider>
  );
}
