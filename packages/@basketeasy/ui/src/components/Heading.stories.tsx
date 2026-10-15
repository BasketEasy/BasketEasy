import type { Meta, StoryObj } from '@storybook/react';
import { Heading } from './Heading';

const meta: Meta<typeof Heading> = {
  title: 'Components/Heading',
  component: Heading,
};
export default meta;
type Story = StoryObj<typeof Heading>;

export const H1: Story = { args: { as: 'h1', children: 'Tableau de bord' } };
export const H1Hero: Story = {
  args: { as: 'h1', size: '6xl', children: 'Moins de tableurs, plus de terrain.' },
};
export const H2: Story = {
  args: { as: 'h2', children: 'Ce que BasketEasy simplifie pour votre club' },
};
export const H2Section: Story = {
  args: { as: 'h2', size: '2xl', children: 'Clubs partenaires (CTC)' },
};
export const H2Small: Story = { args: { as: 'h2', size: 'xl', children: 'Calendrier partagé' } };
export const H3: Story = { args: { as: 'h3', children: 'Titre de sous-section' } };
