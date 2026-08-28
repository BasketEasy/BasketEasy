import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Text } from '@basketeasy/ui/text';

export function ForbiddenPage() {
  return (
    <PageContainer size="md" centered>
      <div className="flex flex-col items-center gap-4 text-center">
        <Heading as="h1">Accès non autorisé</Heading>
        <Text variant="meta">Vous n’êtes pas administrateur de ce club.</Text>
        <Button asChild>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
