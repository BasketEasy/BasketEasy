import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SectionAccordion, SectionAccordionItem } from './SectionAccordion';

const meta: Meta<typeof SectionAccordion> = {
  title: 'Components/SectionAccordion',
  component: SectionAccordion,
};
export default meta;
type Story = StoryObj<typeof SectionAccordion>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState(['presences']);
    return (
      <SectionAccordion value={value} onValueChange={setValue}>
        <SectionAccordionItem
          value="presences"
          title="Présences"
          summary="8 / 12"
          summaryLabel="8 présents sur 12"
        >
          Liste des joueurs
        </SectionAccordionItem>
        <SectionAccordionItem value="partage" title="Partage WhatsApp" summary="Message à partager">
          Carte de partage
        </SectionAccordionItem>
        <SectionAccordionItem value="notes" title="Notes du coach" summary="Apporter les maillots">
          Apporter les maillots blancs.
        </SectionAccordionItem>
      </SectionAccordion>
    );
  },
};
