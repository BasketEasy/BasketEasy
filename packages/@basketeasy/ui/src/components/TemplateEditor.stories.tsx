import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TemplateEditor, type TemplateEditorVariable } from './TemplateEditor';

const VARIABLES: TemplateEditorVariable[] = [
  { key: 'event_name', label: "Nom de l'événement" },
  { key: 'event_time', label: 'Heure de début' },
  { key: 'link', label: 'Lien de réponse' },
];

const meta: Meta<typeof TemplateEditor> = {
  title: 'Components/TemplateEditor',
  component: TemplateEditor,
};
export default meta;

function Demo() {
  const [value, setValue] = useState(
    '🏀 {event_name} à {event_time} !\nDis-nous si tu viens 👉 {link}',
  );
  return <TemplateEditor value={value} onChange={setValue} variables={VARIABLES} />;
}

export const Default: StoryObj<typeof TemplateEditor> = { render: () => <Demo /> };
