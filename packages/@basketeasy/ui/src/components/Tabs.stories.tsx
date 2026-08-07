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
