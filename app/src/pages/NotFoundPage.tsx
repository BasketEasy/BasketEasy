import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Text } from '@basketeasy/ui/text';

export function NotFoundPage() {
  // No bottom-bar clearance: a centered page spends it as padding below the
  // block, which shifts the whole thing off the vertical axis — and this
  // route renders publicly too, where there is no bar at all. Same opt-out
  // as LoginPage/RegisterPage.
  return (
    <PageContainer size="md" centered bottomNav={false}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Text as="span" variant="display" tone="brand" className="text-5xl">
          404
        </Text>
        <Heading as="h1">Page introuvable</Heading>
        <Text variant="meta">
          Ce lien ne mène nulle part. Il a peut-être été supprimé ou déplacé.
        </Text>
        <Button asChild>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
