import type { Meta, StoryObj } from '@storybook/react';
import { DeviceFrame } from './DeviceFrame';

// A transparent pixel: the frame's own ground shows through. The real
// screenshots live in the app package (app/src/assets/landing).
const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const meta: Meta<typeof DeviceFrame> = {
  title: 'Components/DeviceFrame',
  component: DeviceFrame,
  args: { src: placeholder, alt: 'Capture de Kluvo', width: 600, height: 1298 },
};
export default meta;

type Story = StoryObj<typeof DeviceFrame>;

export const Phone: Story = { args: { variant: 'phone', className: 'w-60' } };
export const Browser: Story = {
  args: {
    variant: 'browser',
    url: 'kluvo.fr/dashboard',
    width: 1280,
    height: 800,
    className: 'w-full max-w-2xl',
  },
};
