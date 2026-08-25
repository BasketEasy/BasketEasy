import type { Meta, StoryObj } from '@storybook/react';
import { QueryError } from './QueryError';

const meta: Meta<typeof QueryError> = {
  title: 'Components/QueryError',
  component: QueryError,
};
export default meta;
type Story = StoryObj<typeof QueryError>;

export const Default: Story = {
  render: () => <QueryError />,
};

export const WithRetry: Story = {
  render: () => <QueryError onRetry={() => {}} />,
};

export const Retrying: Story = {
  render: () => <QueryError onRetry={() => {}} isRetrying />,
};

export const CustomCopy: Story = {
  render: () => (
    <QueryError
      title="Équipe introuvable"
      description="Cette équipe n’existe plus ou a été supprimée."
    />
  ),
};
