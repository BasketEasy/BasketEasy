import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'ground', values: [{ name: 'ground', value: '#EFE4D4' }] },
  },
};

export default preview;
