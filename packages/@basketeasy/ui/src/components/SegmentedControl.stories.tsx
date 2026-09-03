import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
};
export default meta;

type Story = StoryObj<typeof SegmentedControl>;

function Demo({
  ariaLabel,
  options,
  tone,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  tone?: 'structure' | 'brand';
}) {
  const [value, setValue] = useState(options[0].value);
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      onChange={setValue}
      options={options}
      tone={tone}
    />
  );
}

/** The events tab's view-mode switch. */
export const ViewMode: Story = {
  render: () => (
    <Demo
      ariaLabel="Affichage des événements"
      options={[
        { value: 'agenda', label: 'Agenda' },
        { value: 'table', label: 'Liste' },
      ]}
    />
  ),
};

/** The agenda's period switch. */
export const Period: Story = {
  render: () => (
    <Demo
      ariaLabel="Période"
      options={[
        { value: 'upcoming', label: 'À venir' },
        { value: 'past', label: 'Passés' },
      ]}
    />
  ),
};

/** Three options, to show the arrow/Home/End roving tab stop with room to move. */
export const ThreeOptions: Story = {
  render: () => (
    <Demo
      ariaLabel="Saison"
      options={[
        { value: '2026', label: '2026-27' },
        { value: '2025', label: '2025-26' },
        { value: '2024', label: '2024-25' },
      ]}
    />
  ),
};

/** The rare sharp accent, for a switch that is itself the primary action. */
export const BrandTone: Story = {
  render: () => (
    <Demo
      ariaLabel="Affichage de l'effectif"
      tone="brand"
      options={[
        { value: 'cards', label: 'Cartes' },
        { value: 'table', label: 'Tableau' },
      ]}
    />
  ),
};
