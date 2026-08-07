import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

describe('Tabs', () => {
  it('shows the default tab content and switches on click', async () => {
    render(
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Effectif</TabsTrigger>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
        </TabsList>
        <TabsContent value="roster">Liste des joueurs</TabsContent>
        <TabsContent value="calendar">Prochains matchs</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Liste des joueurs')).toBeInTheDocument();
    expect(screen.queryByText('Prochains matchs')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Calendrier' }));
    expect(screen.getByText('Prochains matchs')).toBeInTheDocument();
  });
});
