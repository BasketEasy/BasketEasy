import type { Meta, StoryObj } from '@storybook/react';
import { TabBar, TabBarItem } from './TabBar';
import { BuildingIcon } from './icons/BuildingIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { HomeIcon } from './icons/HomeIcon';
import { TrophyIcon } from './icons/TrophyIcon';
import { UserIcon } from './icons/UserIcon';
import { UsersIcon } from './icons/UsersIcon';

const meta: Meta<typeof TabBar> = {
  title: 'Components/TabBar',
  component: TabBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="relative h-48 bg-ground">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TabBar>;

/** The player's four items, with the outstanding-answers pip on tab 1. */
export const PlayerBar: Story = {
  render: () => (
    <TabBar ariaLabel="Navigation principale">
      <TabBarItem icon={<HomeIcon className="h-5 w-5" />} label="Ma semaine" count={2} active />
      <TabBarItem icon={<UsersIcon className="h-5 w-5" />} label="Mon équipe" />
      <TabBarItem icon={<TrophyIcon className="h-5 w-5" />} label="Résultats" />
      <TabBarItem icon={<UserIcon className="h-5 w-5" />} label="Profil" />
    </TabBar>
  ),
};

/** The manager's, whose pip counts what is waiting to be handled. */
export const ManagerBar: Story = {
  render: () => (
    <TabBar ariaLabel="Navigation principale">
      <TabBarItem icon={<HomeIcon className="h-5 w-5" />} label="Accueil" count={4} />
      <TabBarItem icon={<UsersIcon className="h-5 w-5" />} label="Équipes" active />
      <TabBarItem icon={<BuildingIcon className="h-5 w-5" />} label="Club" />
      <TabBarItem icon={<UserIcon className="h-5 w-5" />} label="Profil" />
    </TabBar>
  ),
};

/**
 * A slot the product has reserved but cannot route yet: disabled and dimmed,
 * rather than a link to somewhere it isn't. The explanation belongs in the
 * item's own accessible name, since the label has no room for it.
 */
export const UnavailableItem: Story = {
  render: () => (
    <TabBar ariaLabel="Navigation principale">
      <TabBarItem icon={<HomeIcon className="h-5 w-5" />} label="Ma semaine" active />
      <TabBarItem icon={<UsersIcon className="h-5 w-5" />} label="Mon équipe" />
      <TabBarItem
        icon={<TrophyIcon className="h-5 w-5" />}
        label="Résultats"
        disabled
        aria-label="Résultats (bientôt disponible)"
      />
      <TabBarItem icon={<UserIcon className="h-5 w-5" />} label="Profil" />
    </TabBar>
  ),
};

/**
 * `asChild` renders the caller's element — a router `NavLink` in the app, a
 * plain anchor here. Routing never enters the design system.
 */
export const AsLinks: Story = {
  render: () => (
    <TabBar ariaLabel="Navigation principale">
      <TabBarItem asChild icon={<HomeIcon className="h-5 w-5" />} label="Ma semaine" active>
        <a href="#accueil" />
      </TabBarItem>
      <TabBarItem asChild icon={<CalendarIcon className="h-5 w-5" />} label="Agenda">
        <a href="#agenda" />
      </TabBarItem>
      <TabBarItem asChild icon={<UserIcon className="h-5 w-5" />} label="Profil">
        <a href="#profil" />
      </TabBarItem>
    </TabBar>
  ),
};
