import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card';
import { ListItem } from './List';
import { TableCell, TableRow } from './Table';
import { ResponsiveTable, useTableLayout } from './ResponsiveTable';
import { DESKTOP_BREAKPOINT_PX } from '../lib/useIsDesktopViewport';

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

const ORIGINAL_WIDTH = window.innerWidth;
afterEach(() => setViewport(ORIGINAL_WIDTH));

/** A record component of the shape the pattern expects. */
function PersonRow({ name }: { name: string }) {
  if (useTableLayout() === 'card') {
    return <Card variant="inset">{name}</Card>;
  }
  return (
    <TableRow>
      <TableCell>{name}</TableCell>
    </TableRow>
  );
}

describe('ResponsiveTable', () => {
  it('renders a real table with its headers on desktop', () => {
    setViewport(DESKTOP_BREAKPOINT_PX);
    render(
      <ResponsiveTable columns={['Nom', '']}>
        <PersonRow name="Camille" />
      </ResponsiveTable>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nom' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Camille' })).toBeInTheDocument();
  });

  it('renders the mobile layout as a list of ListItems with `list`', () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    function LinkRow({ name }: { name: string }) {
      return <ListItem>{name}</ListItem>;
    }
    render(
      <ResponsiveTable columns={['Nom']} list>
        <LinkRow name="Camille" />
      </ResponsiveTable>,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders a card stack with no table semantics below the breakpoint', () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    render(
      <ResponsiveTable columns={['Nom', '']}>
        <PersonRow name="Camille" />
      </ResponsiveTable>,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Camille')).toBeInTheDocument();
  });

  it('keeps a header cell for an unlabelled actions column, so the counts line up', () => {
    setViewport(DESKTOP_BREAKPOINT_PX);
    render(
      <ResponsiveTable columns={['Nom', '']}>
        <PersonRow name="Camille" />
      </ResponsiveTable>,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });

  it('defaults to the row layout outside any ResponsiveTable', () => {
    render(
      <table>
        <tbody>
          <PersonRow name="Camille" />
        </tbody>
      </table>,
    );
    expect(screen.getByRole('cell', { name: 'Camille' })).toBeInTheDocument();
  });
});
