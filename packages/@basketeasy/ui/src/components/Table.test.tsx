import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';

describe('Table', () => {
  it('renders headers and rows', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Joueur</TableHead>
            <TableHead>Poste</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Lucas Martin</TableCell>
            <TableCell>Meneur</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.getByText('Lucas Martin')).toBeInTheDocument();
  });
});
