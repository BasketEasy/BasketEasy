import type { Meta, StoryObj } from '@storybook/react';
import { FormField } from './FormField';

const meta: Meta<typeof FormField> = {
  title: 'Components/FormField',
  component: FormField,
};
export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: { label: 'Adresse e-mail', id: 'email', type: 'email', placeholder: 'vous@club.fr' },
};

export const WithError: Story = {
  args: {
    label: 'Adresse e-mail',
    id: 'email-error',
    type: 'email',
    error: 'Adresse email invalide',
  },
};

export const Disabled: Story = {
  args: { label: 'Adresse e-mail', id: 'email-disabled', disabled: true },
};
