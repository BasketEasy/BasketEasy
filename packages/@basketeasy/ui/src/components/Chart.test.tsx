import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarListChart, ColumnChart, type ChartDatum } from './Chart';

const DATA: ChartDatum[] = [
  { key: 'w1', label: '1 sept.', value: 4, display: '4' },
  { key: 'w2', label: '8 sept.', value: null, display: '—' },
  { key: 'w3', label: '15 sept.', value: 9, display: '9', tone: 'brand' },
];

const TABLE = { caption: 'Comptes par semaine', labelHeader: 'Semaine du', valueHeader: 'Comptes' };

describe('Chart', () => {
  it('reads a column chart as a table, unknown values included', () => {
    render(<ColumnChart data={DATA} table={TABLE} />);

    const table = screen.getByRole('table', { name: 'Comptes par semaine' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(DATA.length + 1);
    expect(within(rows[0]).getByRole('columnheader', { name: 'Semaine du' })).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
  });

  it('hides the drawing itself from assistive tech', () => {
    const { container } = render(<BarListChart data={DATA} table={TABLE} />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('table', { name: 'Comptes par semaine' })).toBeInTheDocument();
  });
});
