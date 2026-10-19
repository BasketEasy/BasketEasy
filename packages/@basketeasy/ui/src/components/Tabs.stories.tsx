import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="roster" className="w-80">
      <TabsList>
        <TabsTrigger value="roster">Effectif</TabsTrigger>
        <TabsTrigger value="calendar">Calendrier</TabsTrigger>
      </TabsList>
      <TabsContent value="roster">Liste des joueurs</TabsContent>
      <TabsContent value="calendar">Prochains matchs</TabsContent>
    </Tabs>
  ),
};

// TeamDetailPage's manager bar: six sections, three in the bar below md and
// the rest behind « Plus ».
export const WithMoreSheet: Story = {
  render: () => (
    <Tabs defaultValue="events" className="w-[390px]">
      <TabsList
        more={{
          activeValue: 'events',
          onSelect: () => undefined,
          items: [
            { value: 'maillots', label: 'Maillots' },
            { value: 'clubs', label: 'Clubs partenaires', badge: 2 },
            { value: 'admins', label: 'Administrateurs', badge: 3 },
          ],
        }}
      >
        <TabsTrigger value="events" badge={12}>
          Événements
        </TabsTrigger>
        <TabsTrigger value="roster" badge={18}>
          Effectif
        </TabsTrigger>
        <TabsTrigger value="stats">Statistiques</TabsTrigger>
        <TabsTrigger value="maillots" secondary>
          Maillots
        </TabsTrigger>
        <TabsTrigger value="clubs" badge={2} secondary>
          Clubs partenaires
        </TabsTrigger>
        <TabsTrigger value="admins" badge={3} secondary>
          Administrateurs
        </TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};
