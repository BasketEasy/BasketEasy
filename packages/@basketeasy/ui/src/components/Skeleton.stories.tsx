import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton, SkeletonList } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Block: Story = {
  render: () => <Skeleton className="h-12 w-48" />,
};

export const RowList: Story = {
  render: () => <SkeletonList rows={3} variant="row" />,
};

export const CardList: Story = {
  render: () => <SkeletonList rows={3} variant="card" />,
};
