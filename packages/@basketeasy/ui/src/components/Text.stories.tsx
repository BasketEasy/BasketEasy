import type { Meta, StoryObj } from '@storybook/react';
import { Text } from './Text';

const meta: Meta<typeof Text> = { title: 'Components/Text', component: Text };
export default meta;
type Story = StoryObj<typeof Text>;

export const Body: Story = { args: { children: 'Entraînement déplacé au gymnase Jules-Verne.' } };
export const Label: Story = { args: { variant: 'label', children: 'Camille Bertrand' } };
export const MetaText: Story = {
  args: { variant: 'meta', children: 'Mis à jour il y a 2 heures' },
};
export const Eyebrow: Story = { args: { variant: 'eyebrow', children: 'Prochain match' } };
export const Display: Story = {
  args: { variant: 'display', size: '2xl', className: 'tabular', children: '68 – 54' },
};

/** The role ladder at a glance — drift in one row shows against the others. */
export const Roles: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Text variant="eyebrow">Prochain match</Text>
      <Text variant="display" size="2xl" className="tabular">
        68 – 54
      </Text>
      <Text variant="label">Camille Bertrand</Text>
      <Text>Entraînement déplacé au gymnase Jules-Verne.</Text>
      <Text variant="meta">Mis à jour il y a 2 heures</Text>
    </div>
  ),
};

/** Every tone, on the role that most often carries colour. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      {(['primary', 'secondary', 'brand', 'structure', 'danger', 'success', 'accent'] as const).map(
        (tone) => (
          <Text key={tone} variant="label" size="sm" tone={tone}>
            {tone}
          </Text>
        ),
      )}
      <span className="bg-blue-green p-2">
        <Text variant="label" size="sm" tone="inverse">
          inverse
        </Text>
      </span>
    </div>
  ),
};
