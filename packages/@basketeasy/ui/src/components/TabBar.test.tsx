import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabBar, TabBarItem } from './TabBar';
import { HomeIcon } from './icons/HomeIcon';
import { UserIcon } from './icons/UserIcon';

describe('TabBar', () => {
  it('is a named landmark holding its items', () => {
    render(
      <TabBar ariaLabel="Navigation principale">
        <TabBarItem icon={<HomeIcon />} label="Ma semaine" active />
        <TabBarItem icon={<UserIcon />} label="Profil" />
      </TabBar>,
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('TabBarItem', () => {
  it('marks the active item for assistive tech, not only visually', () => {
    render(<TabBarItem icon={<HomeIcon />} label="Ma semaine" active />);

    const item = screen.getByRole('button', { name: 'Ma semaine' });
    expect(item).toHaveAttribute('aria-current', 'page');
    expect(item).toHaveClass('shadow-nav-active-top');
  });

  it('puts the badge count in the accessible name, since the pip is a graphic', () => {
    render(<TabBarItem icon={<HomeIcon />} label="Ma semaine" count={2} />);

    expect(screen.getByRole('button', { name: 'Ma semaine (2)' })).toBeInTheDocument();
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws no pip for a zero count', () => {
    render(<TabBarItem icon={<HomeIcon />} label="Résultats" count={0} />);

    expect(screen.getByRole('button', { name: 'Résultats' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders the caller-supplied element with asChild, so routing stays outside the design system', () => {
    render(
      <TabBarItem asChild icon={<HomeIcon />} label="Ma semaine" count={3} active>
        <a href="/dashboard" />
      </TabBarItem>,
    );

    const link = screen.getByRole('link', { name: 'Ma semaine (3)' });
    expect(link).toHaveAttribute('href', '/dashboard');
    // The item's own content became the anchor's children — the Slottable
    // path, not a second child next to it.
    expect(link).toHaveTextContent('Ma semaine');
    expect(link).toHaveClass('shadow-nav-active-top');
  });

  it('is a real button when it is not slotted', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TabBarItem icon={<UserIcon />} label="Profil" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Profil' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
