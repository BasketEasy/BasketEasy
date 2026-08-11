import type { Meta, StoryObj } from '@storybook/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { Button } from './Button';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Components/DropdownMenu',
  component: DropdownMenu,
};
export default meta;
type Story = StoryObj<typeof DropdownMenu>;

// Mirrors the header's club switcher shape: a labeled section of clubs (with
// a checkmark on the active one), a divider, then a footer link-style item.
export const ClubSwitcher: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">COC Basket ▾</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Vos clubs (admin)</DropdownMenuLabel>
        <DropdownMenuItem>
          <span className="w-4">✓</span> COC Basket
        </DropdownMenuItem>
        <DropdownMenuItem>
          <span className="w-4" /> ES Basket Nantes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-orange-text">+ Créer un club</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
