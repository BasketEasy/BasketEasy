import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';

const meta: Meta<typeof PageHeader> = {
  title: 'Components/PageHeader',
  component: PageHeader,
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const TitleOnly: Story = {
  render: () => <PageHeader title="Notifications" />,
};

export const WithMeta: Story = {
  render: () => <PageHeader title="Mes équipes" meta="4 équipes" />,
};

export const WithAction: Story = {
  render: () => (
    <PageHeader
      title="Mes équipes"
      meta="4 équipes"
      actions={
        <Button variant="outline" size="sm">
          Créer une équipe
        </Button>
      }
    />
  ),
};
