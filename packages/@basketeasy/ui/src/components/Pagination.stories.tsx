import type { Meta, StoryObj } from '@storybook/react';
import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Components/Pagination',
  component: Pagination,
};
export default meta;
type Story = StoryObj<typeof Pagination>;

export const FirstPage: Story = {
  args: { page: 1, pageSize: 25, total: 342, onPageChange: () => {} },
};

export const MiddlePage: Story = {
  args: { page: 5, pageSize: 25, total: 342, onPageChange: () => {} },
};

export const LastPage: Story = {
  args: { page: 14, pageSize: 25, total: 342, onPageChange: () => {} },
};

export const Empty: Story = {
  args: { page: 1, pageSize: 25, total: 0, onPageChange: () => {} },
};

export const WithPageSizeSelect: Story = {
  args: {
    page: 1,
    pageSize: 25,
    total: 342,
    onPageChange: () => {},
    pageSizeOptions: [10, 25, 50, 100],
    onPageSizeChange: () => {},
  },
};
