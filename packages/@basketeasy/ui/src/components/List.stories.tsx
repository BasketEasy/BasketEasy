import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { List, ListItem } from './List';

const meta: Meta<typeof List> = {
  title: 'Components/List',
  component: List,
};
export default meta;
type Story = StoryObj<typeof List>;

export const Links: Story = {
  name: 'Link rows (in a flush card)',
  render: () => (
    <Card variant="flush" className="w-96">
      <List>
        <ListItem
          asChild
          chevron
          meta="AS Basket · U13"
          trailing={
            <Badge variant="soft" tone="muted">
              Joueur
            </Badge>
          }
        >
          <a href="#u13">U13 Filles</a>
        </ListItem>
        <ListItem asChild chevron meta="AS Basket · Seniors">
          <a href="#seniors">Seniors Masculins</a>
        </ListItem>
      </List>
    </Card>
  ),
};

export const WithActions: Story = {
  name: 'Panel list with actions',
  render: () => (
    <Card variant="panel" className="w-96">
      <List variant="panel">
        <ListItem
          wrap
          meta="Déconnecte tous les appareils"
          trailing={<Button size="sm">Révoquer</Button>}
        >
          Sessions
        </ListItem>
        <ListItem
          wrap
          meta="Envoie un lien de réinitialisation"
          trailing={<Button size="sm">Envoyer</Button>}
        >
          Mot de passe
        </ListItem>
      </List>
    </Card>
  ),
};
