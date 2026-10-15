import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Text } from '@basketeasy/ui/text';

export function NotFoundPage() {
  return (
    <PageContainer size="md" centered>
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
