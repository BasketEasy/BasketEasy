import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { List, ListItem } from './List';

describe('List', () => {
  it('renders a ul of li rows with dividers', () => {
    render(
      <List aria-label="Équipes">
        <ListItem>U13 F</ListItem>
        <ListItem>U15 M</ListItem>
      </List>,
    );
    const list = screen.getByRole('list', { name: 'Équipes' });
    expect(list.tagName).toBe('UL');
    expect(list).toHaveClass('divide-y');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders leading, title, meta lines and trailing', () => {
    render(
      <List>
        <ListItem leading={<span>L</span>} meta={['Club · U13', 'Hier']} trailing={<span>T</span>}>
          U13 F
        </ListItem>
      </List>,
    );
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('U13 F')).toBeInTheDocument();
    expect(screen.getByText('Club · U13')).toBeInTheDocument();
    expect(screen.getByText('Hier')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('puts the row styling on the single child with asChild, keeping it a real link', () => {
    render(
      <List>
        <ListItem asChild chevron meta="Club">
          <a href="/teams/1">U13 F</a>
        </ListItem>
      </List>,
    );
    const link = screen.getByRole('link', { name: /U13 F/ });
    expect(link).toHaveAttribute('href', '/teams/1');
    expect(link).toHaveClass('hover:bg-surface-2');
    expect(link.className).toContain('focus-visible:outline');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('listitem')).toContainElement(link);
  });

  it('keeps the child own handlers when it is a button', async () => {
    const onClick = vi.fn();
    render(
      <List>
        <ListItem asChild>
          <button type="button" onClick={onClick}>
            Relire
          </button>
        </ListItem>
      </List>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('trims the outer padding of the first and last row in a panel list', () => {
    render(
      <List variant="panel" aria-label="Actions">
        <ListItem>Une</ListItem>
      </List>,
    );
    expect(screen.getByRole('list')).toHaveClass('[&>li:first-child>*]:pt-0');
  });
});
