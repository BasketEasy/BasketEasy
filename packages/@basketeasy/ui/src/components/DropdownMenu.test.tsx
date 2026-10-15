import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

function renderMenu(onSelect?: () => void) {
  return render(
    <DropdownMenu>
      <DropdownMenuTrigger>Ouvrir</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Vos clubs (admin)</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onSelect}>COC Basket</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>+ Créer un club</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe('DropdownMenu', () => {
  it('opens content when the trigger is clicked', async () => {
    renderMenu();
    expect(screen.queryByText('COC Basket')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Ouvrir'));
    expect(screen.getByText('COC Basket')).toBeInTheDocument();
  });

  it('closes content on Escape', async () => {
    renderMenu();
    await userEvent.click(screen.getByText('Ouvrir'));
    expect(screen.getByText('COC Basket')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('COC Basket')).not.toBeInTheDocument());
  });

  it('closes when an item is selected, and calls the item’s onSelect handler', async () => {
    const onSelect = () => onSelectSpy();
    let called = false;
    const onSelectSpy = () => {
      called = true;
    };
    renderMenu(onSelect);

    await userEvent.click(screen.getByText('Ouvrir'));
    await userEvent.click(screen.getByText('COC Basket'));

    expect(called).toBe(true);
    await waitFor(() => expect(screen.queryByText('COC Basket')).not.toBeInTheDocument());
  });

  it('renders the label and separator inside the open panel', async () => {
    renderMenu();
    await userEvent.click(screen.getByText('Ouvrir'));

    expect(screen.getByText('Vos clubs (admin)')).toBeInTheDocument();
    expect(screen.getByText('+ Créer un club')).toBeInTheDocument();
  });
});
