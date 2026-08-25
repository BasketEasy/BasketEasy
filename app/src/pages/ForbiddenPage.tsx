import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';

export function ForbiddenPage() {
  return (
    <PageContainer size="md" centered>
      <div className="flex flex-col items-center gap-4 text-center">
        <Heading as="h1">Accès non autorisé</Heading>
        <p className="text-muted">Vous n’êtes pas administrateur de ce club.</p>
        <Button asChild>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
