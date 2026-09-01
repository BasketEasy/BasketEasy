import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { Badge } from './Badge';

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
        <TabsTrigger value="roster" className="gap-2">
          Effectif
          <Badge variant="outline" tone="neutral" aria-hidden="true">
            18
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="clubs" className="gap-2">
          Clubs partenaires
          <Badge variant="outline" tone="neutral" aria-hidden="true">
            2
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="admins" className="gap-2">
          Administrateurs
          <Badge variant="outline" tone="neutral" aria-hidden="true">
            3
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="events" className="gap-2">
          Événements
          <Badge variant="outline" tone="neutral" aria-hidden="true">
            12
          </Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="roster" className="mt-4">
        Liste des joueurs
      </TabsContent>
    </Tabs>
  ),
};
