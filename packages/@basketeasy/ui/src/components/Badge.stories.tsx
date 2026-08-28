import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Solid: Story = { args: { children: 'Convoqué', variant: 'solid', tone: 'brand' } };
export const SolidStructure: Story = {
  args: { children: 'CTC', variant: 'solid', tone: 'structure' },
};
export const Soft: Story = { args: { children: 'À domicile', variant: 'soft', tone: 'structure' } };
export const SoftDanger: Story = { args: { children: 'Conflit', variant: 'soft', tone: 'danger' } };
export const Outline: Story = {
  args: { children: 'Importé', variant: 'outline', tone: 'neutral' },
};
export const OutlineMuted: Story = {
  args: { children: 'Ignoré', variant: 'outline', tone: 'muted' },
};

/** Every supported combination, so drift in one cell is visible against the rest. */
export const Matrix: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(['solid', 'soft', 'outline'] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-2">
          {(['brand', 'structure', 'neutral', 'muted', 'danger'] as const).map((tone) => (
            <Badge key={tone} variant={variant} tone={tone}>
              {variant}/{tone}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  ),
};
