import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { RadioCardGroup, type RadioCardGroupProps } from './RadioCardGroup';
import { Text } from './Text';

const meta: Meta<typeof RadioCardGroup> = {
  title: 'Components/RadioCardGroup',
  component: RadioCardGroup,
};
export default meta;
type Story = StoryObj<typeof RadioCardGroup>;

type Travel = 'MEETING_POINT' | 'DIRECT';

function Example(props: Pick<RadioCardGroupProps<Travel>, 'tone' | 'indicator'>) {
  const [value, setValue] = useState<Travel | null>('MEETING_POINT');
  return (
    <RadioCardGroup<Travel>
      {...props}
      aria-label="Mode de déplacement"
      value={value}
      onChange={setValue}
      className="w-80"
      options={[
        {
          value: 'MEETING_POINT',
          render: () => (
            <span className="flex flex-col">
              <Text variant="label">Avec le groupe</Text>
              <Text variant="meta">RDV 19:15 · Parking du club</Text>
            </span>
          ),
        },
        {
          value: 'DIRECT',
          render: () => (
            <span className="flex flex-col">
              <Text variant="label">Directement à la salle</Text>
              <Text variant="meta">Arrivée 19:45</Text>
            </span>
          ),
        },
      ]}
    />
  );
}

export const Structure: Story = {
  name: 'Structure (a pick among records)',
  render: () => <Example tone="structure" />,
};

export const FormChoice: Story = {
  name: 'Form choice (tone="choice" + indicator)',
  render: () => <Example tone="choice" indicator />,
};

export const Brand: Story = {
  name: 'Brand (the one sharp pick on a screen)',
  render: () => <Example tone="brand" />,
};
