import type { Meta, StoryObj } from '@storybook/react';
import { SelectField } from './SelectField';

const categoryOptions = [
  { value: 'U9', label: 'U9' },
  { value: 'U11', label: 'U11' },
  { value: 'U13', label: 'U13' },
  { value: 'U15', label: 'U15' },
  { value: 'U18', label: 'U18' },
  { value: 'U21', label: 'U21' },
  { value: 'SENIORS', label: 'Séniors' },
];

const meta: Meta<typeof SelectField> = {
  title: 'Components/SelectField',
  component: SelectField,
};
export default meta;
type Story = StoryObj<typeof SelectField>;

export const Default: Story = {
  args: {
    label: 'Catégorie',
    id: 'category',
    options: categoryOptions,
    placeholder: 'Choisir une catégorie',
  },
};

export const WithValue: Story = {
  args: {
    label: 'Catégorie',
    id: 'category-value',
    options: categoryOptions,
    value: 'U15',
  },
};

export const WithError: Story = {
  args: {
    label: 'Catégorie',
    id: 'category-error',
    options: categoryOptions,
    placeholder: 'Choisir une catégorie',
    error: 'Catégorie requise',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Catégorie',
    id: 'category-disabled',
    options: categoryOptions,
    value: 'U15',
    disabled: true,
  },
};
