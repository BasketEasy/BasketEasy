import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';

export function NotFoundPage() {
  return (
    <PageContainer size="md" centered>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-heading text-5xl font-extrabold text-orange-text">404</span>
        <Heading as="h1">Page introuvable</Heading>
        <p className="text-muted">
          Ce lien ne mène nulle part. Il a peut-être été supprimé ou déplacé.
        </p>
        <Button asChild>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
