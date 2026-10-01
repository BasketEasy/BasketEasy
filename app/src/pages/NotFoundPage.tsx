import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ErrorScreen } from '../components/ErrorScreen';

export function NotFoundPage() {
  return (
    <ErrorScreen
      eyebrow="Erreur 404"
      title="Page introuvable"
      description="Ce lien ne mène nulle part. Il a peut-être été supprimé ou déplacé."
      action={
        <Button asChild className="w-full">
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      }
    />
  );
}
