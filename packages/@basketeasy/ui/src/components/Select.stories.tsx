import type { Meta, StoryObj } from '@storybook/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger aria-label="équipe" className="w-48">
        <SelectValue placeholder="Choisir une équipe" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="u13">U13</SelectItem>
        <SelectItem value="u15">U15</SelectItem>
        <SelectItem value="seniors">Seniors</SelectItem>
      </SelectContent>
    </Select>
  ),
};
