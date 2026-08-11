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

// Mirrors the header's actual club switcher shape (AppHeader.tsx): a labeled
// section of clubs, with a checkmark on the active one. "Créer un club" stays
// a top-level nav link outside the switcher (it must remain visible even for
// a zero-admin-club user, who never sees this panel at all — see
// docs/ux-audit/scoping-plan.md §3's "Frontend changes"), so it's not an item
// here.
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
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// DropdownMenuSeparator still exists as a primitive for other call sites that
// do need a footer/section break — shown standalone so it isn't dead code.
export const WithSeparator: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Actions ▾</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem>Modifier</DropdownMenuItem>
        <DropdownMenuItem>Dupliquer</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Supprimer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
