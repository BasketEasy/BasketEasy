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

// Mirrors TeamDetailPage's tab bar (four count-badged triggers) narrowed to
// a phone-width container, where the triggers overflow the track — the
// scenario the edge fades, hidden scrollbar and snap points in Tabs.tsx
// exist for.
export const OverflowingWithBadges: Story = {
  render: () => (
    <Tabs defaultValue="roster" className="w-[320px]">
      <TabsList>
        <TabsTrigger value="roster" badge={18}>
          Effectif
        </TabsTrigger>
        <TabsTrigger value="clubs" badge={2}>
          Clubs partenaires
        </TabsTrigger>
        <TabsTrigger value="admins" badge={3}>
          Administrateurs
        </TabsTrigger>
        <TabsTrigger value="events" badge={12}>
          Événements
        </TabsTrigger>
      </TabsList>
      <TabsContent value="roster" className="mt-4">
        Liste des joueurs
      </TabsContent>
    </Tabs>
  ),
};
