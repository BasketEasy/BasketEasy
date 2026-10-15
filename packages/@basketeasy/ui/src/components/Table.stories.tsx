import type { Meta, StoryObj } from '@storybook/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
};
export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
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
        <TableRow>
          <TableCell>Emma Dubois</TableCell>
          <TableCell>Ailière</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
