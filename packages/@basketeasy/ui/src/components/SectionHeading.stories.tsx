import type { Meta, StoryObj } from '@storybook/react';
import { SectionHeading } from './SectionHeading';

const meta: Meta<typeof SectionHeading> = {
  title: 'Components/SectionHeading',
  component: SectionHeading,
};
export default meta;
type Story = StoryObj<typeof SectionHeading>;

export const WithCount: Story = {
  render: () => <SectionHeading count={12}>Joueuses</SectionHeading>,
};

export const WithoutCount: Story = {
  render: () => <SectionHeading>Staff</SectionHeading>,
};
