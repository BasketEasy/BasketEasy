import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'cream', values: [{ name: 'cream', value: '#FAF5EF' }] },
  },
};

export default preview;
