import type { Meta, StoryObj } from '@storybook/react';
import { PageContainer } from './PageContainer';

const meta: Meta<typeof PageContainer> = {
  title: 'Components/PageContainer',
  component: PageContainer,
};
export default meta;
type Story = StoryObj<typeof PageContainer>;

export const Default: Story = {
  args: {
    size: 'lg',
    children: <p>Contenu de page, largeur standard.</p>,
  },
};

export const Narrow: Story = {
  args: {
    size: 'md',
    children: <p>Contenu de page, largeur étroite (formulaires).</p>,
  },
};

export const Centered: Story = {
  args: {
    size: 'md',
    centered: true,
    children: <p>Formulaire centré verticalement (connexion, inscription).</p>,
  },
};
